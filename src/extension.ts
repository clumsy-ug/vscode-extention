import * as vscode from "vscode";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from "./env";

import { Modification, Deletion } from "./interface";
import extractJSON from "./extractjson";

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        "variable-name-modification.getSuggestion",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const document = editor.document;
                const content = document.getText();

                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "コード分析中...",
                    cancellable: false
                }, async (progress) => {
                    try {
                        const genAI = new GoogleGenerativeAI(API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                        
                        const prompt = `以下のコードを分析し、以下の情報を純粋なJSON形式で返してください。Markdown構文や説明文は含めないでください：
1. 修正すべき変数名や関数名の「行」、「名前」、「修正後の名前」
2. 削除すべき変数名や関数名の「行」と「名前」

修正や削除すべき部分がない場合は、それぞれ空の配列を返してください。

===コード開始===

${content}

===コード終了===

返答例：
{
  "modifications": [
    {"line": 10, "oldName": "変更前の名前", "newName": "変更後の名前"},
    {"line": 24, "oldName": "変更前の名前", "newName": "変更後の名前"}
  ],
  "deletions": [
    {"line": 15, "name": "削除すべき名前"},
    {"line": 58, "name": "削除すべき名前"}
  ]
}`;

                        if (prompt.length > 100000) {
                            vscode.window.showWarningMessage("ファイルが大きすぎるため、一部のみ分析します。");
                        }

                        const result = await model.generateContent(prompt);
                        const resultText = result.response.text();

                        let modifications: Modification[] = [];
                        let deletions: Deletion[] = [];
                        try {
                            // 返答のうちJSONの部分のみ取得
                            const parsedResult = extractJSON(resultText);
                            if (parsedResult) {
                                modifications = parsedResult.modifications || [];
                                deletions = parsedResult.deletions || [];
                            }
                        } catch (error) {
                            vscode.window.showErrorMessage(`Geminiの返答を解析できませんでした: ${error}`);
                            console.error("Geminiの返答:", resultText);
                            console.error("解析エラー:", error);
                            return;
                        }

                        if (modifications.length === 0 && deletions.length === 0) {
                            vscode.window.showInformationMessage("修正または削除すべき箇所はありませんでした。");
                            return;
                        }

                        displayModifications(modifications, deletions);

                        // 修正を適用するかどうかを確認するボタンを表示
                        const applyChanges = await vscode.window.showInformationMessage(
                            `${modifications.length}個の修正と${deletions.length}個の削除が提案されました。修正を適用しますか？`,
                            "はい", "いいえ"
                        );

                        if (applyChanges === "はい") {
                            // 修正を適用する関数を呼び出す
                            await applyModifications(document, modifications, deletions);
                        }

                    } catch (error) {
                        vscode.window.showErrorMessage(`エラーが発生しました: ${error}`);
                        console.error("エラーの詳細:", error);
                    }
                });
            } else {
                vscode.window.showInformationMessage("アクティブなエディタがありません。");
            }
        }
    );

    context.subscriptions.push(disposable);
}

/* 修正の提案を表示する関数 */
function displayModifications(modifications: Modification[], deletions: Deletion[]) {
    console.log('modificationsは', modifications);
    console.log('deletionsは', deletions);
}

/* 実際に修正する関数 */
async function applyModifications(document: vscode.TextDocument, modifications: Modification[], deletions: Deletion[]) {
    const edit = new vscode.WorkspaceEdit();
    const newFileUri = vscode.Uri.file(document.uri.fsPath + '.modified.ts');

    // 元のファイルの内容をコピー
    edit.createFile(newFileUri, { overwrite: true });
    edit.insert(newFileUri, new vscode.Position(0, 0), document.getText());

    // 変数名を置換
    for (const mod of modifications) {
        const range = document.lineAt(mod.line - 1).range;
        const lineText = document.lineAt(mod.line - 1).text;
        const newLineText = lineText.replace(new RegExp(mod.oldName, 'g'), mod.newName);
        edit.replace(newFileUri, range, newLineText);
    }

    // 変数を削除
    for (const del of deletions.sort((a, b) => b.line - a.line)) { // 行番号の降順でソート
        const range = document.lineAt(del.line - 1).range;
        const lineText = document.lineAt(del.line - 1).text;
        const newLineText = lineText.replace(new RegExp(`\\b${del.name}\\b`, 'g'), '');
        edit.replace(newFileUri, range, newLineText);
    }

    await vscode.workspace.applyEdit(edit);
    const newDocument = await vscode.workspace.openTextDocument(newFileUri);
    await vscode.window.showTextDocument(newDocument);
    vscode.window.showInformationMessage("修正が適用された新しいファイルが作成されました。");
}

export function deactivate() {
    console.log("extensionがdeactivateされました");
}
