from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

FAUCET_URL = "https://faucet.circle.com"
DEFAULT_CHAIN_ID = 5042002

_RC = (
    0x0000000000000001,
    0x0000000000008082,
    0x800000000000808A,
    0x8000000080008000,
    0x000000000000808B,
    0x0000000080000001,
    0x8000000080008081,
    0x8000000000008009,
    0x000000000000008A,
    0x0000000000000088,
    0x0000000080008009,
    0x000000008000000A,
    0x000000008000808B,
    0x800000000000008B,
    0x8000000000008089,
    0x8000000000008003,
    0x8000000000008002,
    0x8000000000000080,
    0x000000000000800A,
    0x800000008000000A,
    0x8000000080008081,
    0x8000000000008080,
    0x0000000080000001,
    0x8000000080008008,
)
_ROT = (
    (0, 36, 3, 41, 18),
    (1, 44, 10, 45, 2),
    (62, 6, 43, 15, 61),
    (28, 55, 25, 21, 56),
    (27, 20, 39, 8, 14),
)
_MASK64 = 0xFFFFFFFFFFFFFFFF


def _rot64(value: int, bits: int) -> int:
    bits %= 64
    if bits == 0:
        return value & _MASK64
    return ((value << bits) | (value >> (64 - bits))) & _MASK64


def _keccak_f(state: list[int]) -> None:
    for round_constant in _RC:
        columns = [state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20] for x in range(5)]
        twisted = [columns[(x - 1) % 5] ^ _rot64(columns[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] ^= twisted[x]
        mixed = [0] * 25
        for x in range(5):
            for y in range(5):
                mixed[y + 5 * ((2 * x + 3 * y) % 5)] = _rot64(state[x + 5 * y], _ROT[x][y])
        for x in range(5):
            for y in range(5):
                state[x + 5 * y] = mixed[x + 5 * y] ^ (
                    (~mixed[((x + 1) % 5) + 5 * y]) & mixed[((x + 2) % 5) + 5 * y] & _MASK64
                )
        state[0] ^= round_constant


def keccak256(data: bytes) -> bytes:
    """Ethereum Keccak-256. This is not NIST SHA3-256."""
    rate = 136
    state = [0] * 25
    padded = _keccak_pad(data, rate)
    for offset in range(0, len(padded), rate):
        block = padded[offset : offset + rate]
        for lane in range(rate // 8):
            state[lane] ^= int.from_bytes(block[lane * 8 : lane * 8 + 8], "little")
        _keccak_f(state)
    out = bytearray()
    for lane in range(4):
        out.extend(state[lane].to_bytes(8, "little"))
    return bytes(out)


def _keccak_pad(data: bytes, rate: int) -> bytes:
    pad_len = rate - (len(data) % rate)
    if pad_len == 1:
        return data + b"\x81"
    return data + b"\x01" + (b"\x00" * (pad_len - 2)) + b"\x80"


def _checksum_address(raw_hex: str) -> str:
    body = raw_hex.lower().removeprefix("0x")
    digest = keccak256(body.encode("ascii")).hex()
    chars: list[str] = []
    for index, char in enumerate(body):
        if char in "0123456789":
            chars.append(char)
        elif int(digest[index], 16) >= 8:
            chars.append(char.upper())
        else:
            chars.append(char.lower())
    return "0x" + "".join(chars)


def address_from_private_key(private_key: bytes) -> str:
    if len(private_key) != 32:
        raise ValueError("Arc wallet private key must be 32 bytes.")
    number = int.from_bytes(private_key, "big")
    if number == 0 or number >= 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141:
        raise ValueError("Arc wallet private key is outside the secp256k1 range.")
    private = ec.derive_private_key(number, ec.SECP256K1())
    public = private.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    digest = keccak256(public[1:])
    return _checksum_address(digest[-20:].hex())


@dataclass(frozen=True)
class ArcWallet:
    address: str
    chain_id: int
    private_key_hex: str
    path: Path

    def __repr__(self) -> str:
        return f"ArcWallet(address={self.address!r}, chain_id={self.chain_id})"


def wallet_file_path(key_path: str, data_dir: Path) -> Path:
    raw = Path(key_path or "data/arc-wallet.json")
    if raw.is_absolute():
        return raw
    return data_dir / raw.name


def load_or_create_wallet(path: Path, *, chain_id: int = DEFAULT_CHAIN_ID) -> ArcWallet:
    if path.is_file():
        return _load_wallet(path, chain_id=chain_id)
    private_key = secrets.token_bytes(32)
    address = address_from_private_key(private_key)
    payload = {
        "address": address,
        "chain_id": chain_id,
        "private_key": private_key.hex(),
    }
    _write_secret(path, json.dumps(payload, indent=2) + "\n")
    return ArcWallet(address=address, chain_id=chain_id, private_key_hex=private_key.hex(), path=path)


def _load_wallet(path: Path, *, chain_id: int) -> ArcWallet:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Arc wallet file is unreadable: {path.name}") from exc
    if not isinstance(data, dict):
        raise ValueError(f"Arc wallet file is unreadable: {path.name}")
    stored_chain = data.get("chain_id")
    if stored_chain != chain_id:
        raise ValueError(f"Arc wallet chain id does not match {chain_id}.")
    key_hex = str(data.get("private_key") or "").strip().removeprefix("0x")
    try:
        private_key = bytes.fromhex(key_hex)
    except ValueError as exc:
        raise ValueError(f"Arc wallet file is unreadable: {path.name}") from exc
    address = address_from_private_key(private_key)
    stored = str(data.get("address") or "")
    if stored.lower() != address.lower():
        raise ValueError(f"Arc wallet address does not match its key: {path.name}")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return ArcWallet(address=address, chain_id=chain_id, private_key_hex=key_hex, path=path)


def _write_secret(path: Path, payload: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    try:
        os.write(fd, payload.encode("utf-8"))
    finally:
        os.close(fd)
    os.chmod(path, 0o600)
