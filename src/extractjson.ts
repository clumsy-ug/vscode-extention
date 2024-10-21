export default function extractJSON(text: string) {
    try {
        // まず、テキスト全体をJSONとしてパースを試みる
        return JSON.parse(text);
    } catch (e) {
        // 失敗した場合、JSONらしき部分を探す
        const jsonRegex = /{[\s\S]*}/;
        const match = text.match(jsonRegex);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e) {
                console.error("JSONの抽出に失敗しました:", e);
                return null;
            }
        }
    }
    return null;
}
