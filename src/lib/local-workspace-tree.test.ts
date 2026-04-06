import { describe, expect, it } from "vitest";
import {
  buildMovedEntryPath,
  insertLocalFileIntoFolders,
  insertLocalFolderIntoFolders,
  localWorkspaceTreeContainsPath,
  removeLocalFileFromFolders,
  removeLocalFolderFromFolders,
  sortWorkspaceFiles,
  sortWorkspaceFolders,
} from "./local-workspace-tree";
import type { LocalWorkspaceFolderNode, LocalWorkspaceTreeSnapshot } from "./workspace-types";

const makeFolder = (
  name: string,
  path: string,
  overrides: Partial<LocalWorkspaceFolderNode> = {}
): LocalWorkspaceFolderNode => ({
  name,
  path,
  files: [],
  children: [],
  ...overrides,
});

describe("local-workspace-tree", () => {
  it("sorts files and folders by name", () => {
    expect(
      sortWorkspaceFiles([
        { name: "z.md", path: "z.md" },
        { name: "a.md", path: "a.md" },
      ]).map((file) => file.name)
    ).toEqual(["a.md", "z.md"]);

    expect(
      sortWorkspaceFolders([makeFolder("zeta", "zeta"), makeFolder("alpha", "alpha")]).map(
        (folder) => folder.name
      )
    ).toEqual(["alpha", "zeta"]);
  });

  it("inserts a file into the matching nested folder and avoids duplicates", () => {
    const folders = [
      makeFolder("posts", "posts", {
        children: [makeFolder("2026", "posts/2026")],
      }),
    ];

    const inserted = insertLocalFileIntoFolders(folders, ["posts", "2026"], {
      name: "launch.md",
      path: "posts/2026/launch.md",
    });
    const repeated = insertLocalFileIntoFolders(inserted, ["posts", "2026"], {
      name: "launch.md",
      path: "posts/2026/launch.md",
    });

    expect(inserted[0].children[0].files).toEqual([
      { name: "launch.md", path: "posts/2026/launch.md" },
    ]);
    expect(repeated[0].children[0].files).toHaveLength(1);
  });

  it("removes a nested file without affecting siblings", () => {
    const folders = [
      makeFolder("posts", "posts", {
        children: [
          makeFolder("2026", "posts/2026", {
            files: [
              { name: "keep.md", path: "posts/2026/keep.md" },
              { name: "drop.md", path: "posts/2026/drop.md" },
            ],
          }),
        ],
      }),
    ];

    const next = removeLocalFileFromFolders(folders, "posts/2026/drop.md");

    expect(next[0].children[0].files).toEqual([{ name: "keep.md", path: "posts/2026/keep.md" }]);
  });

  it("inserts folders in sorted order and does not duplicate an existing folder", () => {
    const folders = [makeFolder("zeta", "zeta")];

    const inserted = insertLocalFolderIntoFolders(folders, ["alpha"], "alpha");
    const repeated = insertLocalFolderIntoFolders(inserted, ["alpha"], "alpha");

    expect(inserted.map((folder) => folder.name)).toEqual(["alpha", "zeta"]);
    expect(repeated).toHaveLength(2);
  });

  it("removes a folder subtree by path", () => {
    const folders = [
      makeFolder("posts", "posts", {
        children: [
          makeFolder("2025", "posts/2025"),
          makeFolder("2026", "posts/2026", {
            children: [makeFolder("q1", "posts/2026/q1")],
          }),
        ],
      }),
    ];

    const next = removeLocalFolderFromFolders(folders, "posts/2026");

    expect(next[0].children.map((folder) => folder.path)).toEqual(["posts/2025"]);
  });

  it("detects files and folders anywhere in the tree", () => {
    const tree: LocalWorkspaceTreeSnapshot = {
      files: [{ name: "root.md", path: "root.md" }],
      folders: [
        makeFolder("posts", "posts", {
          children: [
            makeFolder("2026", "posts/2026", {
              files: [{ name: "launch.md", path: "posts/2026/launch.md" }],
            }),
          ],
        }),
      ],
    };

    expect(localWorkspaceTreeContainsPath(tree, "root.md")).toBe(true);
    expect(localWorkspaceTreeContainsPath(tree, "posts")).toBe(true);
    expect(localWorkspaceTreeContainsPath(tree, "posts/2026/launch.md")).toBe(true);
    expect(localWorkspaceTreeContainsPath(tree, "posts/2024")).toBe(false);
  });

  it("builds a moved path using normalized target directories", () => {
    expect(buildMovedEntryPath("posts/2026/launch.md", "")).toBe("launch.md");
    expect(buildMovedEntryPath("posts/2026/launch.md", "/drafts//weekly/")).toBe(
      "drafts/weekly/launch.md"
    );
  });
});
