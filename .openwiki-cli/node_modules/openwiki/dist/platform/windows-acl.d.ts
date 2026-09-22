/**
 * Mirrors the POSIX 0o700 owner-only intent on Windows, where fs.chmod only
 * toggles the read-only attribute and leaves ACLs untouched: grants full
 * control to the current user and SYSTEM (inheritable, so new children are
 * covered), then removes inherited ACEs. The grant runs before the
 * inheritance reset so a failed grant can never lock the user out of the
 * directory. Best-effort by design: returns false instead of throwing so
 * ACL tooling problems never block a run. No-op on non-Windows platforms.
 */
export declare function restrictDirToCurrentUser(dirPath: string): Promise<boolean>;
