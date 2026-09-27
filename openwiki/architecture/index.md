# Files

- [Chat Pipeline](chat-pipeline.md) - How ChatService prepares a prompt, reserves budget, calls the router, redacts a buffered stream once, and sends the latest user turn with the assistant reply to a content-safety outbound scan.
- [System Architecture](system.md) - One FastAPI process wires ports to infrastructure in bootstrap, owns a single LiteLLM Router, and refuses a second worker when Redis is off.
