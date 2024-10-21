export interface Modification {
    line: number;
    oldName: string;
    newName: string;
}

export interface Deletion {
    line: number;
    name: string;
}
