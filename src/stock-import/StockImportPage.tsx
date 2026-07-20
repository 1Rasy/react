import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  DEALER_OUTBOUND_FILE_TYPE_ERROR,
  isDealerOutboundExcelFileName,
  type DealerOutboundXlsxLibrary
} from '../domain/dealer-outbound-import.ts';
import type { DealerOutboundImportRepository } from '../services/dealer-outbound-import-repository.ts';
import {
  createUnifiedDealerOutboundImportController,
  type DealerOutboundImporterKind
} from './DealerOutboundImportController.ts';

type StockImportPageProps = {
  repository: DealerOutboundImportRepository;
  xlsx?: DealerOutboundXlsxLibrary;
};

type ImporterCardProps = StockImportPageProps & {
  kind: DealerOutboundImporterKind;
  title: '吉能' | '长涛';
  fixedMap: string;
};

type Status = { text: string; error: boolean } | null;

const IMPORTERS: ReadonlyArray<Pick<ImporterCardProps, 'kind' | 'title' | 'fixedMap'>> = [
  {
    kind: 'jn',
    title: '吉能',
    fixedMap: 'A单号、C制单日期、D客户编号、E客户、G条形码、H商品名称、I包装、J件、L散'
  },
  {
    kind: 'ct',
    title: '长涛',
    fixedMap: 'A制单日期、C商品名称、D包装、F件、G散、Q客户编号、R客户名称、X单号、AA条形码'
  }
] as const;

function errorText(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error || '未知错误');
}

function ImporterCard({ kind, title, fixedMap, repository, xlsx }: ImporterCardProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [buttonDisabled, setButtonDisabled] = useState(true);
  const [dragover, setDragover] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useMemo(() => createUnifiedDealerOutboundImportController({
    repository,
    xlsx,
    alert: message => window.alert(message)
  }), [repository, xlsx]);

  function pick(file: File) {
    if (!isDealerOutboundExcelFileName(file.name)) {
      window.alert(DEALER_OUTBOUND_FILE_TYPE_ERROR);
      return;
    }
    setSelectedFile(file);
    setButtonDisabled(false);
    setStatus(null);
  }

  function changeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (file) pick(file);
  }

  function handleDrag(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    handleDrag(event);
    setDragover(false);
    const file = event.dataTransfer.files?.[0];
    if (file) pick(file);
  }

  async function startImport() {
    if (!selectedFile) return;
    setButtonDisabled(true);
    try {
      await controller.importFile({
        kind,
        file: selectedFile,
        setStatus: (text, error = false) => setStatus({ text, error })
      });
      setSelectedFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      console.error(error);
      const message = `导入失败：${errorText(error)}`;
      setStatus({ text: message, error: true });
      window.alert(message);
    } finally {
      setButtonDisabled(false);
    }
  }

  return (
    <section className="card" data-importer={kind}>
      <h2>{title}</h2>
      <div className="map"><strong>固定列：</strong>{fixedMap}</div>
      <div
        className={`upload-box${dragover ? ' dragover' : ''}`}
        onDragEnter={event => { handleDrag(event); setDragover(true); }}
        onDragLeave={event => { handleDrag(event); setDragover(false); }}
        onDragOver={event => { handleDrag(event); setDragover(true); }}
        onDrop={handleDrop}
      >
        <div style={{ fontSize: 13 }}>点击选择文件，或拖拽 Excel 到这里</div>
        <input
          accept=".xlsx,.xls"
          className="file"
          onChange={changeFile}
          ref={inputRef}
          type="file"
        />
      </div>
      <div className="info" style={{ display: selectedFile ? 'block' : 'none' }}>
        已选择文件：<span className="file-name">{selectedFile?.name || ''}</span>
      </div>
      <button className="btn-submit" disabled={buttonDisabled} onClick={() => void startImport()} type="button">
        导入
      </button>
      <div className={`status${status ? '' : ' hide'}${status?.error ? ' error' : ''}`}>
        {status?.text || ''}
      </div>
    </section>
  );
}

export function StockImportPage({ repository, xlsx }: StockImportPageProps) {
  return (
    <main className="container">
      <a className="back" href="dashboard.html">← 返回管理后台</a>
      <h1 className="page-title">经销商erp导入</h1>
      <div className="import-grid" id="importGrid">
        {IMPORTERS.map(importer => (
          <ImporterCard key={importer.kind} {...importer} repository={repository} xlsx={xlsx} />
        ))}
      </div>
    </main>
  );
}
