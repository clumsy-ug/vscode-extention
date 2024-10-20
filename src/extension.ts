import * as vscode from "vscode";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from "./env";

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
                        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
                        
                        const prompt = "以下のコードを分析し、使われている変数名や関数名などで、修正すべき部分があればその「行」と「名前」をマークダウン形式で教えてください。無い場合はこのコードの内容を推測してください。\n\n===コード開始===\n\n";
                        const fullPrompt = prompt + content + "\n\n===コード終了===";

                        if (fullPrompt.length > 100000) {
                            vscode.window.showWarningMessage("ファイルが大きすぎるため、一部のみ分析します。");
                        }

                        const result = await model.generateContent(fullPrompt);
                        const resultText = result.response.text();

                        // 結果を "Gemini-suggestion.md" という名前の新しいファイルで表示
                        const workspaceEdit = new vscode.WorkspaceEdit();
                        const newFileUri = vscode.Uri.file(vscode.workspace.workspaceFile + '/Gemini-suggestion.md');
                        workspaceEdit.createFile(newFileUri, { overwrite: true });
                        workspaceEdit.insert(newFileUri, new vscode.Position(0, 0), resultText);
                        await vscode.workspace.applyEdit(workspaceEdit);

                        const document = await vscode.workspace.openTextDocument(newFileUri);
                        await vscode.window.showTextDocument(document);

                        vscode.window.showInformationMessage("分析完了: 結果をGemini-suggestion.md に表示しています。");
                    } catch (error) {
                        vscode.window.showErrorMessage(`エラーが発生しました: ${error}`);
                    }
                });
            } else {
                vscode.window.showInformationMessage("アクティブなエディタがありません。");
            }
        }
    );

    context.subscriptions.push(disposable);
}

export function deactivate() {
    console.log("entensionがdeactivateされました");
}
