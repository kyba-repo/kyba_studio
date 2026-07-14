import uvicorn
import argparse
import multiprocessing
from server import app

if __name__ == "__main__":
    # Important for PyInstaller to work correctly with multiprocessing if any library uses it
    multiprocessing.freeze_support()
    
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    
    uvicorn.run(app, host=args.host, port=args.port)
