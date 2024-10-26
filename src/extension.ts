import * as vscode from "vscode";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from "./env";

import { Modification, Deletion } from "./interface";
import extractJSON from "./extractjson";
import createSuggestionFile from "./createSuggestionFile";
import applyModifications from "./applymodification";

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
