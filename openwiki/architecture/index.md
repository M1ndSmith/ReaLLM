# Files

- [Chat Pipeline](chat-pipeline.md) - How ChatService prepares a prompt, reserves budget, calls the router, and redacts a streamed reply once when PII is on.
- [System Architecture](system.md) - One FastAPI process wires ports to infrastructure in bootstrap, owns a single LiteLLM Router, and refuses a second worker when Redis is off.
