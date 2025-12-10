#!/bin/bash

# ============================================
# Nginx配置更新脚本 - 将端口从3003改为3004
# ============================================

echo "开始更新nginx配置..."

# 1. 备份原配置文件
echo "步骤1: 备份原配置文件..."
sudo cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup.$(date +%Y%m%d_%H%M%S)
echo "✓ 备份完成"

# 2. 使用sed命令替换端口号
echo "步骤2: 将端口3003替换为3004..."
sudo sed -i 's/proxy_pass http:\/\/localhost:3003;/proxy_pass http:\/\/localhost:3004;/g' /etc/nginx/sites-available/default
echo "✓ 端口替换完成"

# 3. 验证配置文件语法
echo "步骤3: 验证nginx配置语法..."
sudo nginx -t
if [ $? -eq 0 ]; then
    echo "✓ 配置文件语法正确"
    
    # 4. 重新加载nginx配置
    echo "步骤4: 重新加载nginx配置..."
    sudo systemctl reload nginx
    if [ $? -eq 0 ]; then
        echo "✓ Nginx配置已成功更新并重新加载"
        echo ""
        echo "配置更新完成！新服务现在应该可以通过公网访问了。"
        echo "如果遇到问题，可以使用以下命令恢复备份："
        echo "sudo cp /etc/nginx/sites-available/default.backup.* /etc/nginx/sites-available/default"
        echo "sudo systemctl reload nginx"
    else
        echo "✗ Nginx重新加载失败，请检查错误信息"
        exit 1
    fi
else
    echo "✗ 配置文件语法错误，请检查配置"
    echo "可以使用以下命令恢复备份："
    echo "sudo cp /etc/nginx/sites-available/default.backup.* /etc/nginx/sites-available/default"
    exit 1
fi









