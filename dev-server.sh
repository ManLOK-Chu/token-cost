#!/bin/bash

# API Token 计费模拟器 - 开发服务器启动脚本

PORT=8000

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 启动开发服务器"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  端口: $PORT"
echo "  主应用: http://localhost:$PORT/index.html"
echo "  测试页: http://localhost:$PORT/test-optimizations.html"
echo ""
echo "  按 Ctrl+C 停止服务器"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查端口是否被占用
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  端口 $PORT 已被占用，尝试使用其他端口..."
    PORT=8001
    echo "  使用端口: $PORT"
    echo "  主应用: http://localhost:$PORT/index.html"
    echo ""
fi

# 启动服务器
python3 -m http.server $PORT
