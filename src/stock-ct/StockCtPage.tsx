import { useMemo, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  DEALER_OUTBOUND_FILE_TYPE_ERROR,
  isDealerOutboundExcelFileName,
  type DealerOutboundXlsxLibrary
} from '../domain/dealer-outbound-import.ts';
import type { DealerOutboundImportRepository } from '../services/dealer-outbound-import-repository.ts';
import { createCtDealerOutboundImportController } from './DealerOutboundImportController.ts';

type StockCtPageProps = {
  repository: DealerOutboundImportRepository;
  xlsx?: DealerOutboundXlsxLibrary;
};

type Status = { text: string; error: boolean } | null;

function errorText(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error || '未知错误');
}

export function StockCtPage({ repository, xlsx }: StockCtPageProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInfoVisible, setFileInfoVisible] = useState(false);
  const [buttonDisabled, setButtonDisabled] = useState(true);
  const [dragover, setDragover] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const controller = useMemo(() => createCtDealerOutboundImportController({
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
    setFileInfoVisible(true);
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
        file: selectedFile,
        setStatus: (text, error = false) => setStatus({ text, error })
      });
      setFileInfoVisible(false);
      setSelectedFile(null);
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
    <main className="container">
      <a className="back" href="dashboard.html">← 返回管理后台</a>
      <section className="card">
        <h2>长涛库存导入</h2>
        <div className="map"><strong>固定列：</strong>A制单日期、C商品名称、D包装、F件、G散、Q客户编号、R客户名称、X单号、AA条形码</div>
        <div
          className={`upload${dragover ? ' dragover' : ''}`}
          id="dropZone"
          onDragEnter={event => { handleDrag(event); setDragover(true); }}
          onDragLeave={event => { handleDrag(event); setDragover(false); }}
          onDragOver={event => { handleDrag(event); setDragover(true); }}
          onDrop={handleDrop}
        >
          <div style={{ fontSize: 13 }}>点击选择文件，或拖拽 Excel 到这里</div>
          <input
            accept=".xlsx,.xls"
            className="file"
            id="excelFile"
            onChange={changeFile}
            type="file"
          />
        </div>
        <div className="info" id="fileInfo" style={{ display: fileInfoVisible ? 'block' : 'none' }}>
          已选择文件：<span id="fileName">{selectedFile?.name || ''}</span>
        </div>
        <button className="btn" disabled={buttonDisabled} id="submitBtn" onClick={() => void startImport()} type="button">
          确认导入数据库
        </button>
        <div className={`status${status ? '' : ' hide'}${status?.error ? ' error' : ''}`} id="statusMsg">
          {status?.text || ''}
        </div>
      </section>
    </main>
  );
}
