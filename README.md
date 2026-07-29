# vips-thumbnail

一个基于 **libvips** 的图片压缩和缩略图命令行工具，支持单图片和批量处理 JPG / PNG。

## 功能

- 默认只压缩，不改变图片尺寸
- 可按最长边生成缩略图
- 支持单文件、目录和递归处理
- 支持 macOS、Linux 和 Windows x64
- 支持 npm 和 Homebrew 安装

## npm 安装

需要 Node.js 18 或更高版本：

```bash
npm install --global vips-thumbnail
thumbnail --help
```

也可以不全局安装，直接运行：

```bash
npx vips-thumbnail --help
```

### libvips 依赖

Windows x64 用户不需要手动安装。首次执行图片处理时，如果系统中没有 `vips`，工具会自动下载 libvips 8.18.4，校验 SHA-256 后安装到：

```text
%LOCALAPPDATA%\vips-thumbnail\libvips\8.18.4
```

帮助命令不会触发下载。已有系统 `vips` 时会优先使用系统版本。

macOS 和 Linux 用户需要先安装 libvips：

```bash
# macOS
brew install vips

# Ubuntu / Debian
sudo apt update
sudo apt install -y libvips-tools
```

## Homebrew 安装（macOS）

```bash
brew tap giszhc/vips-thumbnail
brew install thumbnail
```

## 使用方法

```text
thumbnail <源路径> <输出路径> [参数]
```

只压缩图片，不改变尺寸：

```bash
thumbnail ./images ./out --quality 80
```

生成最长边为 400 像素的缩略图：

```bash
thumbnail ./images ./out --size 400 --quality 80
```

处理单张图片：

```bash
thumbnail ./photo.jpg ./out/photo.jpg --quality 80
```

递归处理目录：

```bash
thumbnail ./photos ./compressed --quality 75 --recursive
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `--quality <1-100>` | JPG 压缩质量，默认 85 |
| `--size <数字>` | 最长边尺寸，不传则保持原尺寸 |
| `--ext <.jpg\|.jpeg\|.png>` | 指定输出格式 |
| `--recursive` | 递归处理子目录 |
| `-h, --help` | 显示帮助 |

## 发布

版本号与 Git tag 应保持一致。例如发布 `0.2.3`：

```bash
npm test
npm pack --dry-run
git tag v0.2.3
git push origin v0.2.3
```

推送 `v*` tag 后，GitHub Actions 会发布 npm 包并更新 Homebrew Formula。仓库需要配置 `NPM_TOKEN` 和 `HOMEBREW_TAP_TOKEN`。

## License

MIT
