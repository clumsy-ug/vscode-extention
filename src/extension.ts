import * as vscode from "vscode";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from "./env";

import { Modification, Deletion } from "./interface";
import extractJSON from "./extractjson";
import createSuggestionFile from "./createSuggestionFile";

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand(
        "name-modification.getSuggestion",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const document = editor.document;
                const content = document.getText();

                let modifications: Modification[] = [];
                let deletions: Deletion[] = [];
                
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "コード分析中...",
                    cancellable: false
                }, async (progress) => {
                    try {
                        const genAI = new GoogleGenerativeAI(API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
                        
                        const prompt = `以下のコードを分析し、以下の情報を純粋なJSON形式で返してください。Markdown構文や説明文は含めないでください：
1. 修正すべき変数名や関数名の「行」、「名前」、「修正後の名前」
2. 削除すべき変数名や関数名の「行」と「名前」

※重要事項
1. 修正・削除すべき変数名・関数名が複数個所で使われている場合、その中で1番最初に出現する部分のみを返してください。すべて返す必要はありません。
2. //で始まるコメントや/*で始まり*/で終わるコメントの部分は考慮しないでください。
3. 修正・削除すべき部分がない場合は、修正と削除それぞれ空の配列を返してください。

===コード開始===
${content.split('\n').map((line, index) => `${index + 1}: ${line}`).join('\n')}
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

                        // 修正内容のファイルを作成
                        try {
                            await createSuggestionFile(document, modifications, deletions);
                        } catch (e) {
                            vscode.window.showErrorMessage('エラー発生');
                            console.error('createSuggestionFileでエラー発生: ', e);
                        }

                    } catch (error) {
                        vscode.window.showErrorMessage(`エラーが発生しました: ${error}`);
                        console.error("エラーの詳細:", error);
                    }
                });

                // 提案を受け入れるか聞く
                const answer = await vscode.window.showInformationMessage(
                    "提案内容のファイルを作成しました。提案を適用したファイルを作成しますか？",
                    "はい", "いいえ"
                );

                // 提案を受け入れた場合、実際に修正内容を適用したファイルを作成する
                if (answer === "はい") {
                    try {
                        await applyModifications(document, content, modifications, deletions);
                    } catch (e) {
                        vscode.window.showErrorMessage('エラー発生');
                        console.error('applyModificationsでエラー発生: ', e);
                    }
                }

            } else {
                vscode.window.showInformationMessage("アクティブなエディタがありません。");
            }
        }
    );

    context.subscriptions.push(disposable);
}

async function applyModifications(document: vscode.TextDocument, content: string, modifications: Modification[], deletions: Deletion[]) {
    let arrContent = content.split('\n');

    // if (modifications.length > 0) {
    //     function escapeRegExp(str: string) {
    //         return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    //     }

    //     for (const mod of modifications) {
    //         const regex = new RegExp(`(^|[^a-zA-Z0-9])(${escapeRegExp(mod.oldName)})(?=[^a-zA-Z0-9]|$)`, 'g');
    //         arrContent[mod.line - 1] = arrContent[mod.line - 1].replace(regex, `$1${mod.newName}`);
    //     }
    // }

    if (modifications.length !== 0) {
        let newContent = content;
        for (const mod of modifications) {
            const modOldName = mod.oldName;
            const modNewName = mod.newName;

            function escapeRegExp(str: string) {
                return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            // \\bにしてるのになぜかtext.〇〇などのドットだとしてもちゃんとtextの部分に変更が反映されてるのが謎
            const regex = new RegExp(`\\b${escapeRegExp(modOldName)}\\b`, 'g');
            newContent = newContent.replace(regex, modNewName);
            arrContent = newContent.split('\n');
        }
    }

    if (deletions.length > 0) {
        // 降順にすれば、削除ごとに元のコードが1行減るという問題を気にしないでよくなる
        deletions.sort((a, b) => b.line - a.line);
        let delLines = [];
        
        for (const del of deletions) {
            delLines.push(del.line);
        }

        for (const delLine of delLines) {
            arrContent.splice(delLine - 1, 1);
        }
    }

    const newContent = arrContent.join('\n');

    /* 削除テスト用 */
    let num1 = 32;
    const num2 = 32;
    let fire = 'fire';
    fire = 'world';
    num1++;

    // 新しくファイルを作成し、そのファイルの内容をnewTextにした上で表示すれば完成
    const edit = new vscode.WorkspaceEdit();
    const newFileUri = vscode.Uri.file(document.uri.fsPath + '.modified.ts');

    edit.createFile(newFileUri, { overwrite: true });
    edit.insert(newFileUri, new vscode.Position(0, 0), newContent);

    await vscode.workspace.applyEdit(edit);
    const newDocument = await vscode.workspace.openTextDocument(newFileUri);
    await vscode.window.showTextDocument(newDocument);
}

export function deactivate() {
    console.log("extensionがdeactivateされました");
}
