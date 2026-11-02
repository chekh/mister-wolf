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
  realPath?(path: string): Promise<string>;
  fileDigest?(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}
