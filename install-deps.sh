#!/bin/bash

echo "Installing client dependencies..."
cd client
npm install

echo "Installing server dependencies..."
cd ../server
npm install

echo "All dependencies installed successfully!"
echo ""
echo "To build the client for production, run:"
echo "cd client && npm run build"
echo ""
echo "To start the server in production, run:"
echo "cd server && npm start"

