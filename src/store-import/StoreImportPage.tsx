import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoreImportXlsxLibrary } from '../domain/store-import.ts';
import type { StoreImportRepository } from '../services/store-import-repository.ts';
import {
  createStoreImportController,
  type StoreImportControllerOptions
} from './StoreImportController.ts';

export type StoreImportPageProps = {
  repository: StoreImportRepository | null;
  xlsx?: StoreImportXlsxLibrary;
  alert?: (message: string) => void;
  readFile?: StoreImportControllerOptions['readFile'];
};

function message(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error);
}

export function StoreImportPage({
  repository,
  xlsx,
  alert = window.alert,
  readFile
}: StoreImportPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('系统初始化中...');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragover, setDragover] = useState(false);
  const controller = useMemo(() => createStoreImportController({
    repository,
    xlsx,
    alert,
    readFile
  }), [repository, xlsx, alert, readFile]);

  useEffect(() => {
    void controller.initialize(setStatus);
  }, [controller]);

  async function processFile(file: File) {
    try {
      setReady(await controller.processExcelFile(file, setStatus));
    } catch (error) {
      console.error(error);
      setStatus(`网络或系统异常: ${message(error)}`);
    }
  }

  async function executeImport() {
    setBusy(true);
    try {
      await controller.executeImport(setStatus);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <a className="back" href="dashboard.html">← 返回管理后台</a>
      <h1 className="page-title">门店导入</h1>
      <div className="card">
        <h2>门店导入</h2>
        <div
          className={`upload-box${dragover ? ' dragover' : ''}`}
          id="dropZone"
          onDragEnter={event => event.preventDefault()}
          onDragOver={event => {
            event.preventDefault();
            setDragover(true);
          }}
          onDragLeave={event => {
            event.preventDefault();
            setDragover(false);
          }}
          onDrop={event => {
            event.preventDefault();
            setDragover(false);
            const file = event.dataTransfer.files[0];
            if (file) void processFile(file);
          }}
        >
          <div style={{ fontSize: 13, color: '#6c757d' }}>
            点击选择文件，或将门店 Excel 文件拖拽至此处
          </div>
          <input
            ref={inputRef}
            type="file"
            id="excelFile"
            className="file-input"
            accept=".xlsx, .xls"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void processFile(file);
            }}
          />
        </div>
        <div id="status" className="status">{status}</div>
        <button
          id="submitBtn"
          className="btn-submit"
          disabled={!ready || busy}
          onClick={() => void executeImport()}
        >
          导入
        </button>
      </div>
    </div>
  );
}
