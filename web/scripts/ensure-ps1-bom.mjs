/**
 * 给 PowerShell 脚本补 UTF-8 BOM 并做语法预检。
 *
 * Windows PowerShell 5.1（powershell.exe）在没有 BOM 时会按系统代码页读取 .ps1，
 * 简中环境下中文注释与字符串会乱码并直接语法报错。PowerShell 7 默认按 UTF-8 读，
 * 但加 BOM 对两者都安全，所以统一加。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const files = process.argv.slice(2).filter((path) => path.endsWith(".ps1") || path.endsWith(".psm1"));
if (files.length === 0) {
  console.log("用法：node scripts/ensure-ps1-bom.mjs <文件…>");
  process.exit(0);
}

let fixed = 0;
for (const path of files) {
  const bytes = readFileSync(path);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  if (hasBom) {
    console.log(`BOM 已存在：${path}`);
    continue;
  }
  writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]));
  console.log(`已补 BOM：${path}`);
  fixed += 1;
}

// 用 PowerShell 解析器做一次语法检查，中文乱码这类问题会在这里暴露
for (const path of files) {
  const script = `$e=$null;[System.Management.Automation.Language.Parser]::ParseFile('${path.replace(/\\/g, "\\\\")}',[ref]$null,[ref]$e)|Out-Null;if($e){$e|ForEach-Object{$_.Message};exit 1}else{'语法通过：${path.replace(/\\/g, "\\\\")}'}`;
  try {
    const output = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8" });
    process.stdout.write(output);
  } catch (error) {
    console.error(`语法检查失败：${path}`);
    process.stdout.write(String(error.stdout ?? ""));
    process.exitCode = 1;
  }
}

console.log(fixed === 0 ? "无需修改。" : `共补 BOM ${fixed} 个文件。`);
