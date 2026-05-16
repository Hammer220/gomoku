#!/usr/bin/env python3
from PIL import Image, ImageDraw
import random
import math

def generate_wood_texture(width, height, seed=None):
    """生成木纹纹理"""
    if seed:
        random.seed(seed)
    
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    # 基础棕色色调
    base_r = random.randint(160, 200)
    base_g = random.randint(100, 150)
    base_b = random.randint(50, 100)
    
    for x in range(width):
        for y in range(height):
            # 添加木纹波动
            wave = math.sin(x * 0.05 + y * 0.02) * 20
            wave2 = math.sin(x * 0.02 - y * 0.03) * 10
            
            # 随机变化
            variation = random.randint(-15, 15)
            
            r = max(0, min(255, int(base_r + wave + wave2 + variation)))
            g = max(0, min(255, int(base_g + wave * 0.5 + wave2 * 0.5 + variation)))
            b = max(0, min(255, int(base_b + variation * 0.5)))
            
            pixels[x, y] = (r, g, b)
    
    return img

def generate_stone_texture(width, height, seed=None):
    """生成石纹纹理"""
    if seed:
        random.seed(seed)
    
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    base_r = random.randint(180, 210)
    base_g = random.randint(180, 210)
    base_b = random.randint(180, 210)
    
    for x in range(width):
        for y in range(height):
            noise = random.randint(-30, 30)
            wave = math.sin(x * 0.1) * math.cos(y * 0.1) * 10
            
            r = max(0, min(255, base_r + noise + wave))
            g = max(0, min(255, base_g + noise + wave))
            b = max(0, min(255, base_b + noise + wave))
            
            pixels[x, y] = (r, g, b)
    
    return img

def generate_bamboo_texture(width, height, seed=None):
    """生成竹纹纹理"""
    if seed:
        random.seed(seed)
    
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    base_r = random.randint(200, 230)
    base_g = random.randint(180, 210)
    base_b = random.randint(140, 170)
    
    # 添加竹节
    joints = [random.randint(0, height) for _ in range(5)]
    
    for x in range(width):
        for y in range(height):
            is_joint = any(abs(y - j) < 8 for j in joints)
            
            if is_joint:
                r = max(0, min(255, base_r - 30))
                g = max(0, min(255, base_g - 30))
                b = max(0, min(255, base_b - 20))
            else:
                variation = random.randint(-10, 10)
                wave = math.sin(x * 0.08) * 5
                r = max(0, min(255, base_r + variation + wave))
                g = max(0, min(255, base_g + variation + wave))
                b = max(0, min(255, base_b + variation + wave))
            
            pixels[x, y] = (r, g, b)
    
    return img

def generate_marble_texture(width, height, seed=None):
    """生成大理石纹理"""
    if seed:
        random.seed(seed)
    
    img = Image.new('RGB', (width, height))
    pixels = img.load()
    
    base_r = random.randint(230, 250)
    base_g = random.randint(220, 245)
    base_b = random.randint(210, 240)
    
    vein_r = random.randint(100, 150)
    vein_g = random.randint(100, 140)
    vein_b = random.randint(90, 130)
    
    for x in range(width):
        for y in range(height):
            # 生成大理石纹理
            noise1 = math.sin(x * 0.03) * math.cos(y * 0.04)
            noise2 = math.sin(x * 0.08 + y * 0.03)
            noise3 = math.cos(x * 0.05 - y * 0.06)
            
            total_noise = noise1 + noise2 * 0.5 + noise3 * 0.3
            
            if abs(total_noise) > 0.7