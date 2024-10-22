import * as vscode from "vscode";
import { Modification, Deletion } from "./interface";

export default async function createSuggestionFile(document: vscode.TextDocument, modifications: Modification[], deletions: Deletion[]) {
    let suggestText = "# 提案内容\n\n";
    if (modifications.length !== 0) {
        suggestText += "## 変更\n";

        // modificationの追加処理
        for (const modObj of modifications) {
            const modificationText = `${modObj.line}行目 | 変更前の名前: ${modObj.oldName} | 変更後の名前: ${modObj.newName}\n`;
            suggestText += modificationText;
        }

        if (deletions.length !== 0) {
            // deletionの追加処理
            suggestText += '\n## 削除\n';
            for (const delObj of deletions) {
                const deletionText = `${delObj.line}行目 | 名前: ${delObj.name}\n`;
                suggestText += deletionText;
            }
        }
    } else if (deletions.length !== 0) {
        suggestText += "## 削除\n";

        // deletionの追加処理
        for (const delObj of deletions) {
            const deletionText = `${delObj.line}行目 | 名前: ${delObj.name}\n`;
            suggestText += deletionText;
        }
    }

    const edit = new vscode.WorkspaceEdit();
    const newFileUri = vscode.Uri.file(document.uri.fsPath + '.suggestion.md');

    edit.createFile(newFileUri, { overwrite: true });
    edit.insert(newFileUri, new vscode.Position(0, 0), suggestText);

    await vscode.workspace.applyEdit(edit);
    const newDocument = await vscode.workspace.openTextDocument(newFileUri);
    await vscode.window.showTextDocument(newDocument);
}
