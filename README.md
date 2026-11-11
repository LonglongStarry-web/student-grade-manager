# 学生成绩管理系统

离线运行的 Windows 桌面应用，支持班级、科目和学生管理、考试成绩录入、统计分析、个人成绩查询，以及 CSV 导出和 JSON 备份。

## 本地运行

在 Windows 上安装 Node.js 和 npm 后，在项目目录执行：

~~~powershell
npm ci
npm start
~~~

## 生成 Windows x64 安装包

~~~powershell
npm run dist
~~~

安装包输出到 dist 目录。

## 本地数据

桌面应用将数据保存在 %APPDATA%\StudentGradeManager\data.json，备份文件为同目录下的 data.json.bak。已有数据会在应用启动时载入。

## 恢复来源

应用代码来自 1.0.0 安装版的 app.asar。当前启动脚本和安装包配置为恢复时补建，Electron 版本与原程序一致。
