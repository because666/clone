import os
import zipfile
import subprocess
import shutil
import sys
from pathlib import Path

def create_readme(folder_path, description):
    with open(os.path.join(folder_path, "readme.txt"), "w", encoding="utf-8") as f:
        f.write(description)

def main():
    print("=== AetherWeave 比赛提交流程打包工具 ===")
    team_id = input("请输入你的参赛编号 (例如: 2026012345): ").strip()
    
    if not team_id:
        print("参赛编号不能为空！退出...")
        return
        
    desktop = Path(os.path.expanduser("~")) / "OneDrive" / "桌面"
    if not desktop.exists():
        desktop = Path(os.path.expanduser("~")) / "Desktop"

    main_folder_name = f"{team_id}-参赛总文件夹"
    main_folder_path = desktop / main_folder_name

    # 1. 创建主文件夹
    if not main_folder_path.exists():
        os.makedirs(main_folder_path)
        print(f"\n[成功] 已在桌面创建主文件夹: {main_folder_name}")
    else:
        print(f"\n[提示] 桌面已存在文件夹 '{main_folder_name}'，将直接更新其中的内容。")

    # 2. 创建4个子文件夹及 readme.txt
    folders = [
        (f"{team_id}-01作品与答辩材料", "本文件夹存放：作品安装包/运行网址、答辩PPT及其PDF版本、答辩视频（限制10分钟内，MP4格式，500M以内）。"),
        (f"{team_id}-02素材与源码", "本文件夹存放：项目源代码压缩包、具有代表性的图片/视频/音乐素材等。"),
        (f"{team_id}-03设计与开发文档", "本文件夹存放：作品信息概要表(PDF)、设计和开发文档(PDF)、AI工具使用说明(PDF)及佐证材料。"),
        (f"{team_id}-04作品演示视频", "本文件夹存放：作品运行演示视频（实机录制）。")
    ]

    for folder_name, readme_content in folders:
        folder_path = main_folder_path / folder_name
        os.makedirs(folder_path, exist_ok=True)
        create_readme(folder_path, readme_content)
        print(f"[成功] 已创建或更新子文件夹并生成 readme.txt: {folder_name}")

    # 3. 打包源代码
    print("\n[执行] 正在自动打包最纯净的源代码 (排除大文件、缓存、无关文档)...")
    try:
        project_root = Path(__file__).parent.parent
        zip_filename = f"{team_id}-素材源码.zip"
        zip_path = main_folder_path / folders[1][0] / zip_filename
        
        # 需要排除的目录和文件模式（只排除真正的垃圾文件、缓存和编译产物）
        exclude_dirs = {'.git', 'node_modules', 'dist', '__pycache__', '.pytest_cache', '.idea', '.vscode', '.venv', 'venv'}
        exclude_files = {'.env', 'AetherWeave-源码.zip'}
        exclude_exts = {'.docx', '.pdf', '.zip'}
        
        # 针对根目录单独排除的一些比赛文件
        root_excludes = {
            '1+软件应用与开发类作品提交要求（2026版）.txt',
            '2-作品信息概要表（必填模板）（2026年版）.txt',
            '3+软件应用与开发类作品设计和开发文档模板（2026版）.txt',
            '4-AI工具使用说明（选用模板）（2026年版）.txt',
            '4C2026大赛通知（发布版）.md'
        }

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(project_root):
                # 过滤不需要的目录 (在遍历中直接修改 dirs 列表可以阻止 os.walk 进入这些目录)
                dirs[:] = [d for d in dirs if d not in exclude_dirs]
                
                for file in files:
                    # 过滤不需要的文件
                    if file in exclude_files or file in root_excludes:
                        continue
                    if any(file.endswith(ext) for ext in exclude_exts):
                        continue
                        
                    # 如果是根目录，额外过滤掉上面定义的 root_excludes
                    rel_path = Path(root).relative_to(project_root)
                    if str(rel_path) == '.' and file in root_excludes:
                        continue

                    # 获取文件的完整路径和相对路径
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, project_root)
                    
                    zipf.write(file_path, arcname)
                    
        print(f"[成功] 源代码打包成功！已过滤掉所有杂乱文件，存入 02 文件夹: {zip_filename}")
        
    except Exception as e:
        print(f"[错误] 源码打包失败，请手动打包。错误信息: {e}")

    print("\n[完成] 第一步和第二步的初始工作已完成！")
    print(f"请去你的桌面上查看 {main_folder_name} 文件夹。")
    print("\n后续你需要手动完成的内容：")
    print("1. 将你的【作品演示视频】放进【04作品演示视频】文件夹。")
    print("2. 如果你项目中用到了很大的独立视频/音频素材，请放进【02素材与源码】文件夹。")

if __name__ == "__main__":
    main()
