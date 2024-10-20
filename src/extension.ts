// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { API_KEY } from './env';

export async function activate(context: vscode.ExtensionContext) {
	console.log('-----extensionがactivateされました-----');

	const genAI = new GoogleGenerativeAI(API_KEY);
	const model = genAI.getGenerativeModel({ model: "gemini-pro" });
	const prompt = "このファイルでは何をしていると思う？";
	const result = await model.generateContent(prompt);
	const resultText = result.response.text();
	console.log(resultText);

	const disposable = vscode.commands.registerCommand('vs-devio-opener.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vs-devio-opener!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {
	console.log('entensionがdeactivateされました');
}
