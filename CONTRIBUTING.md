# Contributing to AI Movie Studio 2

Thanks for your interest in contributing! This project is built by filmmakers and developers, for filmmakers and developers.

## Getting Started

1. **Fork** the repository on GitHub
2. **Clone** your fork locally
3. Follow the [Quick Start guide](README.md#-quick-start-5-minutes) in the README to set up your dev environment
4. Create a branch for your feature or fix: `git checkout -b my-feature`

## Development Workflow

1. **Make your changes** — keep code clean and follow existing patterns
2. **Test locally** — make sure the app runs without errors:
   ```bash
   # Backend
   cd backend && python main.py serve --reload
   
   # Frontend
   cd frontend && npm run dev
   ```
3. **Commit with clear messages** — use conventional commits when possible:
   - `feat: add new camera preset`
   - `fix: resolve WebGL context leak`
   - `refactor: extract ShotCreatePanel from ShotComposer`
4. **Push to your fork** and open a Pull Request

## Code Style

- **Frontend:** TypeScript, React functional components with hooks, Tailwind CSS classes
- **Backend:** Python 3.10+, type hints where possible, Pydantic schemas
- **No hardcoded API keys or secrets** — use environment variables
- **Follow the Driver pattern** — new AI models go in `backend/core/drivers/`

## Adding a New AI Model

1. Create a new driver in `backend/core/drivers/` implementing the base class
2. Register it in `backend/core/drivers/__init__.py`
3. No frontend changes needed — the model appears in the dropdown automatically

## Reporting Issues

- Use GitHub Issues to report bugs or request features
- Include steps to reproduce, expected behavior, and screenshots if possible
- Mention your OS, browser, and whether you're using local ComfyUI or cloud APIs

## Questions?

Contact: nathan.mcconnell@sandboxentmt.com

## License

By contributing, you agree that your contributions will be licensed under the AGPLv3 license.
