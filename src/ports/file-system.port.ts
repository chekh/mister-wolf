export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

export interface FileSystem {
  listDirectory(path: string): Promise<DirectoryEntry[]>;
  readSmallTextFile(path: string): Promise<string | null>;
  isDirectory(path: string): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  writeFile(path: string, content: string): Promise<void>;
}
