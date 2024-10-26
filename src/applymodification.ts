import * as vscode from "vscode";

import { Modification, Deletion } from "./interface";

export default async function applyModifications(document: vscode.TextDocument, content: string, modifications: Modification[], deletions: Deletion[]) {
    let arrContent = content.split('\n');

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
