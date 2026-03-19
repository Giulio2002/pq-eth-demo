#!/bin/bash
cat "$(dirname "$0")/rpc_url.txt" 2>/dev/null || echo "http://127.0.0.1:8545"
