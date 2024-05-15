'use strict';

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import sudo from 'sudo-prompt';

const REG_JUMP_BIN = `${path.resolve(__dirname, '../bin/regjump.exe')} "{key}"`;
const sudoOptions = {
	name: 'RegJump'
};

type RegContent = {
	key: string;
	subkey?: Array<string>;//?表示非必须
};

const formatRegex = /\s*(;[;\!@#\$%\^&\*\(\)\-\+\\\/\[\]\{\}]*)\s*/g;
const hKeyRegex = /\[-?HK.*?\]/g;//reg 匹配[-HK……] 的项目 才认定为HKEY，

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(
		vscode.commands.registerTextEditorCommand('extension.reg.jumpToKey', jumpToRegKey)
	);

	// 👎 formatter implemented as separate command
	vscode.commands.registerCommand('extension.format-reg', () => {
		const { activeTextEditor } = vscode.window;

		if (activeTextEditor && activeTextEditor.document.languageId === 'reg') {
			const { document } = activeTextEditor;
			const firstLine = document.lineAt(0);
			if (firstLine.text !== '42') {
				const edit = new vscode.WorkspaceEdit();
				edit.insert(document.uri, firstLine.range.start, '42\n');
				return vscode.workspace.applyEdit(edit);
			}
		}
	});

	//hoverProvider 允许你在鼠标悬停在代码中的标识符上时，提供自定义的悬停提示信息。
	vscode.languages.registerHoverProvider('reg', {
		provideHover(document, position, token) {
			return {
				contents: ['这是一个自定义的悬停提示内容']
			};
		}
	});

	//definitionProvider 允许你在代码中跳转到标识符的定义处。
	// vscode.languages.registerDefinitionProvider('reg', {
	// 	provideDefinition(document, position, token) {
	// 		// 在这里实现获取标识符定义的逻辑
	// 		// 返回一个 Location 对象，指向标识符的定义处
	// 		return new vscode.Location(/* 文件 URI */, /* 定义处的位置 */);
	// 	}
	// });

	// 👍 formatter implemented using API
	vscode.languages.registerDocumentFormattingEditProvider('reg', {
		provideDocumentFormattingEdits(document: vscode.TextDocument) {
			let lCount = document.lineCount;


			if (lCount > 3000) {
				vscode.window.showInformationMessage('line is too much!(>3000),give up!');
				return [];
				// return [vscode.TextEdit.insert(document.lineAt(0).range.start, 'line is too much!(>2000),give up!\n')];
				// return [vscode.window.showInformationMessage('line is too much!(>2000),give up!')];
			}


			let regHeader: string = "Windows Registry Editor Version 5.00\n";
			let otherStrBetweenHeadAnd1KArr: Array<string> = [];//游离在 Header 与 第一个 [] 之间的其他行。



			const regContentArray: Array<RegContent> = [];
			//let itemKey: Array<RegContent> = [];
			//HKEY ：“根键”或“主键”， HKEY_name，它意味着某一键的句柄。
			//key（键）
			//subkey（子键）
			//branch（分支）
			//value entry（值项）
			//字符串（REG_SZ）
			//二进制（REG_BINARY）
			//双字（REG_DWORD）
			//Default（默认值或缺省值）
			//HKCR, HKCU, HKLM, HKU, and HKCC
			//HKEY_CLASSES_ROOT (HKCR)
			// HKEY_CURRENT_USER (HKCU)
			// HKEY_LOCAL_MACHINE (HKLM)
			// HKEY_USERS (HKU)
			// HKEY_CURRENT_CONFIG (HKCC)


			/* topLevel: */
			for (let i = 0; i < lCount; i++) {
				const lineContent = document.lineAt(i);
				let nextLineText = lineContent.text.trim();
				if (nextLineText.match(/^\s*Windows\s+Registry\s+Editor\s+Version\s+5\.00*/g)) {
					//reg 头标注
					regHeader = nextLineText.replaceAll(formatRegex, (match, group1) => " " + group1 + " ").trim() + "\n";
					continue;
				}
				if (nextLineText.match(hKeyRegex)) {
					//reg [] 项目,持续读完到 or 下一个[]
					//console.log(nextLineText + " :is []!");

					let regContent: RegContent = {
						key: nextLineText.trim(),
						subkey: []
					};
					regContentArray.push(regContent);

					do {
						if (++i >= lCount) { break; }//超界，跳出

						nextLineText = document.lineAt(i).text.trim();

						if (nextLineText.length === 0) { continue; }//跳过空行 

						if (nextLineText.match(hKeyRegex)) {
							if (nextLineText.startsWith(regContent.key.replaceAll(/\].*/g, ""))
								&& regContent.subkey?.length === 0//下一个非空行[]是本[]的父类 前提是 子项也是空！
							) {//下一个非空行[]是本[]的父类
								regContent.key = nextLineText;
								continue;
							} else { --i; break; }//读到下一个  [] 项目,回退 跳出
						}

						if (nextLineText.match(/^\s*Windows\s+Registry\s+Editor\s+Version\s+5\.00*/g)) { continue; }//跳过 reg 头标注

						//既没有超界，也没到下一个 []项目，判断 nextLineText 是不是 \结尾，
						if (!nextLineText.endsWith("\\")) {
							//不是 \结尾，直接添加 one Line subKeyLine
							const singleSubKeyLine = nextLineText;
							//console.log("singleSubKeyLine:" + singleSubKeyLine + "|for" + regContent.key);
							regContent.subkey?.push(singleSubKeyLine.trim());
						} else {
							//是 \结尾， ,持续读完到 or 下一个不是 \结尾的行
							//nextLineText.endsWith("\\")) 
							let multiSubKeyLine = nextLineText.substring(0, nextLineText.length - 1);//删除行位的 \

							do {
								if (++i >= lCount) { break; }
								nextLineText = document.lineAt(i).text.trim();
								if (nextLineText.match(/^\s*Windows\s+Registry\s+Editor\s+Version\s+5\.00*/g)) { continue; }//跳过 reg 头标注

								if (nextLineText.endsWith("\\")) {
									//是 \结尾，拼接成为新的行；
									multiSubKeyLine += nextLineText.substring(0, nextLineText.length - 1);
								} else {
									//已经不是 \结尾,判断是 读完了 还是读到了[]?
									if (nextLineText.match(hKeyRegex)) {
										--i;//读到了[] 回退，读过头了
									} else {
										multiSubKeyLine += nextLineText;// 读完了 把最后的一行也加上
									}
									break;
								}
							} while (true);

							//console.log("multiSubKeyLine:" + multiSubKeyLine + "|for" + regContent.key);
							regContent.subkey?.push(multiSubKeyLine.trim());

						}
					} while (true);//不断读取下一行
					//console.log("regContent:" + regContent.key + "|subKeyCount:" + regContent.subkey?.length);
				} else {
					//console.log(nextLineText + " :is subKey or otherStrArr,should after regHeader!");
					otherStrBetweenHeadAnd1KArr.push("    ;;;=others=;;;" + nextLineText.trim());
				}
			}

			// console.log(regHeader);
			// console.log(otherStrBetweenHeadAnd1KArr);
			// console.log(regContentArray);

			let newText = regHeader;
			otherStrBetweenHeadAnd1KArr.forEach(otherStrBetweenHeadAnd1K => {
				newText += otherStrBetweenHeadAnd1K + "\n";
			});

			const regContentArrayNoDup = mergeDuplicates(regContentArray);
			regContentArrayNoDup.sort((a, b) => a.key.localeCompare(b.key)).forEach(
				regItem => {
					newText += "\n" + regItem.key.replaceAll(formatRegex, (match, group1) => " " + group1 + " ").trim() + "\n";
					regItem.subkey?.sort().forEach(
						regSubItem => {
							let subKeyStr = regSubItem.trim().replaceAll(formatRegex, (match, group1) => {
								return " " + group1 + " ";/* .toUpperCase() */
							});
							subKeyStr = "  " + subKeyStr.trim();//统一前面的空格补回来
							newText += subKeyStr + "\n";

						}
					);
				}
			);

			return [vscode.TextEdit.replace(new vscode.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end)
				, newText)];

		}
	});

	function mergeDuplicates(array: Array<RegContent>): Array<RegContent> {
		return array.reduce((acc, { key, subkey }) => {
			const existing = acc.find(n => n.key === key);
			if (existing) {
				subkey?.forEach(sk => {
					existing.subkey?.push(sk);
				});

			} else {
				acc.push({ key, subkey: subkey });
			}
			return acc;
		}, [] as RegContent[]);
	}


}



// This method is called when your extension is deactivated
export function deactivate() { }


function jumpToRegKey(textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) {
	textEditor.selections.forEach(function (selection: vscode.Selection) {
		var document = textEditor.document;
		var line = document.lineAt(selection.anchor);
		var text = textEditor.document.getText(line.range);
		var regMatches = text.match(/\[-?(.*?)\]/);

		if (regMatches) {
			var command = REG_JUMP_BIN.replace("{key}", regMatches[1]);

			sudo.exec(command, sudoOptions, function (err: any, stdout: any, stderr: any) {
				if (err) {
					console.log(err);
					vscode.window.showErrorMessage(`RegJump faild, ${err}`);
					return;
				}
			});
		}
	});
}