export type MaterialDocument = {
  id: number;
  title: string;
  filename: string;
  format?: string;
  status?: string;
};

const materialGroups = [
  { id: "document", label: "阅读文档", formats: new Set(["pdf", "docx", "markdown", "md", "txt"]) },
  { id: "sheet", label: "表格数据", formats: new Set(["xlsx", "csv"]) },
  { id: "slides", label: "演示文稿", formats: new Set(["pptx", "ppt"]) },
  { id: "notebook", label: "代码笔记", formats: new Set(["ipynb"]) },
] as const;

function documentFormat(document: MaterialDocument) {
  const explicit = (document.format || "").toLowerCase();
  if (explicit) return explicit;
  return document.filename.split(".").pop()?.toLowerCase() || "other";
}

function groupedDocuments(documents: MaterialDocument[]) {
  const knownFormats = new Set(materialGroups.flatMap((group) => Array.from(group.formats)));
  const groups = materialGroups.map((group) => ({
    id: group.id,
    label: group.label,
    documents: documents.filter((document) => group.formats.has(documentFormat(document) as never)),
  }));
  const other = documents.filter((document) => !knownFormats.has(documentFormat(document)));
  return other.length ? [...groups, { id: "other", label: "其他资料", documents: other }] : groups;
}

function selectionForGroup(selectedIds: number[], documents: MaterialDocument[]) {
  const groupIds = documents.map((document) => document.id);
  const allSelected = groupIds.length > 0 && groupIds.every((id) => selectedIds.includes(id));
  return allSelected
    ? selectedIds.filter((id) => !groupIds.includes(id))
    : Array.from(new Set([...selectedIds, ...groupIds]));
}

export function MaterialPicker({
  workspace,
  open,
  documents,
  selectedIds,
  onClear,
  onClose,
  onToggle,
  onSelectionChange,
}: {
  workspace: boolean;
  open: boolean;
  documents: MaterialDocument[];
  selectedIds: number[];
  onClear: () => void;
  onClose: () => void;
  onToggle: (documentId: number) => void;
  onSelectionChange: (documentIds: number[]) => void;
}) {
  const groups = groupedDocuments(documents).filter((group) => group.documents.length);
  const availableIds = documents.map((document) => document.id);
  const allSelected = availableIds.length > 0
    && availableIds.every((id) => selectedIds.includes(id));
  return (
    <div
      className="agent-document-picker-slot"
      data-testid="agent-document-picker-slot"
      data-state={open ? "open" : "closed"}
    >
      {(!workspace || open) && (
        <section
          className="agent-document-picker"
          aria-label={workspace ? "学习资料" : "选择 Agent 阅读的资料"}
          aria-hidden={!open}
        >
          <header>
            <div>
              <strong>{workspace ? "选择学习资料" : "选择阅读资料"}</strong>
              <span>{selectedIds.length} / {documents.length}</span>
            </div>
            <div className="agent-document-picker__actions">
              {documents.length > 0 && (
                <button
                  aria-label={allSelected ? "清空全部资料" : "全选全部资料"}
                  tabIndex={open ? 0 : -1}
                  onClick={() => onSelectionChange(allSelected ? [] : availableIds)}
                >
                  {allSelected ? "取消全选" : "全选"}
                </button>
              )}
              {selectedIds.length > 0 && (
                <button tabIndex={open ? 0 : -1} onClick={onClear}>清空</button>
              )}
              <button
                aria-label="完成资料选择"
                tabIndex={open ? 0 : -1}
                onClick={onClose}
              >
                完成
              </button>
            </div>
          </header>
          <div
            className="agent-document-picker__list"
            role="group"
            aria-label="可选资料列表"
          >
            {groups.map((group) => {
              const groupSelected = group.documents.every((document) => selectedIds.includes(document.id));
              return (
                <section
                  className="agent-document-picker__group"
                  aria-label={`${group.label} · ${group.documents.length} 份`}
                  key={group.id}
                >
                  <header>
                    <div><strong>{group.label}</strong><span>{group.documents.length}</span></div>
                    <button
                      type="button"
                      tabIndex={open ? 0 : -1}
                      aria-label={`${groupSelected ? "取消全选" : "全选"}${group.label}`}
                      onClick={() => onSelectionChange(selectionForGroup(selectedIds, group.documents))}
                    >
                      {groupSelected ? "取消" : "全选"}
                    </button>
                  </header>
                  <div>
                    {group.documents.map((document) => {
                      const selected = selectedIds.includes(document.id);
                      return (
                        <label key={document.id}>
                          <input
                            type="checkbox"
                            aria-label={`${document.title} · ${document.filename}`}
                            checked={selected}
                            tabIndex={open ? 0 : -1}
                            onChange={() => onToggle(document.id)}
                          />
                          <span><strong>{document.title}</strong><small>{document.filename}</small></span>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          {!documents.length && (
            <span className="agent-document-picker__empty">这门课程还没有可用资料，请先到资料书架导入。</span>
          )}
        </section>
      )}
    </div>
  );
}
