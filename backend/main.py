"""
AI Movie Studio 2 - CLI Entry Point

Usage:
    python main.py serve                    # Start the API server
    python main.py serve --port 8001        # Custom port
    python main.py serve --reload           # Auto-reload for development
"""

import argparse
import sys

from dotenv import load_dotenv

load_dotenv()


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    print(f"\n[*] AI Movie Studio 2 - Starting Server")
    print(f"{'='*50}")
    print(f"   Host: {args.host}")
    print(f"   Port: {args.port}")
    print(f"   Reload: {args.reload}")
    print(f"\n   API Docs: http://{args.host}:{args.port}/docs")
    print(f"   Health:   http://{args.host}:{args.port}/health")
    print(f"{'='*50}\n")

    uvicorn.run(
        "app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="AI Movie Studio 2 - Backend CLI & Server",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    serve_parser = subparsers.add_parser("serve", help="Start the FastAPI server")
    serve_parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    serve_parser.add_argument("--port", "-p", type=int, default=8001, help="Port to bind to")
    serve_parser.add_argument("--reload", "-r", action="store_true", help="Enable auto-reload")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return 0

    if args.command == "serve":
        return cmd_serve(args)

    return 0


if __name__ == "__main__":
    sys.exit(main())
