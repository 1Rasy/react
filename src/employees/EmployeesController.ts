import {
  applyEmployeeMappingChange,
  buildEmployeeRows,
  employeeDatabasePatch,
  employeeMappingPlan,
  employeesSummary,
  filterEmployees,
  getEmployeeCustomerCode,
  isDuplicateEmployeeError,
  isEmployeeMappingDuplicateError,
  normalizeCustomerCode,
  normalizeEmployeeFieldValue,
  normalizeEmployeeMappings,
  sortEmployees,
  type EmployeeDatabasePatch,
  type EmployeeDirtyPatch,
  type EmployeeEditableField,
  type EmployeeMapping,
  type EmployeeRow,
  type EmployeeSourceRow
} from '../domain/employees.ts';
import {
  EmployeesRepositoryError,
  type EmployeesPageData,
  type NewEmployeePayload
} from '../services/employees-repository.ts';

export type EmployeesStatusKind = '' | 'error' | 'ok';

export type EmployeesSnapshot = {
  employees: readonly EmployeeRow[];
  filtered: readonly EmployeeRow[];
  dirtyMap: ReadonlyMap<string, EmployeeDirtyPatch>;
  searchText: string;
  showInlineNewEmployee: boolean;
  creatingEmployee: boolean;
  status: string;
  statusKind: EmployeesStatusKind;
};

export type EmployeeCreateInput = {
  employee_code: unknown;
  name: unknown;
  customer_code: unknown;
  is_active: unknown;
};

export type EmployeesRepositoryContract = {
  loadEmployees(): Promise<EmployeesPageData>;
  insertEmployee(payload: NewEmployeePayload): Promise<EmployeeSourceRow>;
  updateEmployee(id: string, patch: EmployeeDatabasePatch): Promise<EmployeeSourceRow>;
  unassignCustomerCode(customerCode: string): Promise<void>;
  upsertCustomerCode(customerCode: string, employeeCode: string): Promise<void>;
};

export type EmployeesControllerOptions = {
  repository: EmployeesRepositoryContract;
  logError?: (error: unknown) => void;
};

function errorMessage(error: unknown): string {
  return String((error as { message?: unknown } | null)?.message || error || '未知错误');
}

function rawError(error: unknown): unknown {
  return error instanceof EmployeesRepositoryError ? error.rawError : error;
}

export function createEmployeesController(options: EmployeesControllerOptions) {
  const { repository, logError = error => console.error(error) } = options;
  const listeners = new Set<() => void>();
  let employees: EmployeeRow[] = [];
  let mappings: EmployeeMapping[] = [];
  let dirtyMap = new Map<string, EmployeeDirtyPatch>();
  let searchText = '';
  let showInlineNewEmployee = false;
  let creatingEmployee = false;
  let status = '正在加载员工...';
  let statusKind: EmployeesStatusKind = '';
  let snapshot: EmployeesSnapshot;

  function refreshSnapshot() {
    snapshot = {
      employees,
      filtered: filterEmployees(employees, searchText),
      dirtyMap,
      searchText,
      showInlineNewEmployee,
      creatingEmployee,
      status,
      statusKind
    };
  }

  function emit() {
    refreshSnapshot();
    listeners.forEach(listener => listener());
  }

  function setStatus(message: string, kind: EmployeesStatusKind = '') {
    status = message;
    statusKind = kind;
  }

  function setSummary() {
    const filteredCount = filterEmployees(employees, searchText).length;
    setStatus(employeesSummary(employees.length, filteredCount, dirtyMap.size));
  }

  async function saveMappingForEmployee(
    nextEmployeeCode: unknown,
    previousEmployeeCode: unknown,
    nextCustomerCode: unknown
  ): Promise<boolean> {
    const plan = employeeMappingPlan(
      mappings,
      nextEmployeeCode,
      previousEmployeeCode,
      nextCustomerCode
    );
    if (plan.wantedCode === null) {
      setStatus('保存失败：一个员工只能对应一个经销商客户编号。', 'error');
      emit();
      return false;
    }

    for (const customerCode of plan.toUnassign) {
      try {
        await repository.unassignCustomerCode(customerCode);
      } catch (error) {
        const source = rawError(error);
        logError(source);
        setStatus('保存经销商客户编号失败：' + errorMessage(source), 'error');
        emit();
        return false;
      }
    }

    if (plan.wantedCode) {
      try {
        await repository.upsertCustomerCode(plan.wantedCode, plan.nextCode);
      } catch (error) {
        const source = rawError(error);
        logError(source);
        setStatus(
          isEmployeeMappingDuplicateError(source)
            ? '保存经销商客户编号失败：该员工已经绑定了其他经销商客户编号，请刷新后再试。'
            : '保存经销商客户编号失败：' + errorMessage(source),
          'error'
        );
        emit();
        return false;
      }
    }

    mappings = applyEmployeeMappingChange(mappings, {
      ...plan,
      wantedCode: plan.wantedCode
    });
    return true;
  }

  async function saveRow(id: string): Promise<boolean> {
    const patch = dirtyMap.get(String(id));
    if (!patch) {
      setStatus('本行没有需要保存的修改。');
      emit();
      return true;
    }
    const cleanPatch = employeeDatabasePatch(patch);
    if (
      Object.prototype.hasOwnProperty.call(cleanPatch, 'employee_code')
      && String(cleanPatch.employee_code || '').trim() === ''
    ) {
      setStatus('保存失败：员工工号不能为空。', 'error');
      emit();
      return false;
    }
    if (
      Object.prototype.hasOwnProperty.call(cleanPatch, 'name')
      && String(cleanPatch.name || '').trim() === ''
    ) {
      setStatus('保存失败：员工姓名不能为空。', 'error');
      emit();
      return false;
    }
    const employee = employees.find(row => String(row.id) === String(id));
    if (!employee) {
      setStatus('保存失败：找不到这名员工，请刷新后再试。', 'error');
      emit();
      return false;
    }

    const previousEmployeeCode = String(
      employee.original_employee_code || employee.employee_code || ''
    ).trim();
    const nextEmployeeCode = String(cleanPatch.employee_code || employee.employee_code || '').trim();
    const nextCustomerCode = Object.prototype.hasOwnProperty.call(patch, 'customer_code')
      ? patch.customer_code
      : employee.customer_code;
    let data: EmployeeSourceRow = {
      id: employee.id,
      employee_code: nextEmployeeCode,
      name: Object.prototype.hasOwnProperty.call(cleanPatch, 'name')
        ? String(cleanPatch.name || '')
        : employee.name,
      is_active: Object.prototype.hasOwnProperty.call(cleanPatch, 'is_active')
        ? Boolean(cleanPatch.is_active)
        : employee.is_active,
      created_at: employee.created_at
    };

    if (Object.keys(cleanPatch).length > 0) {
      try {
        data = await repository.updateEmployee(String(id), cleanPatch);
      } catch (error) {
        const source = rawError(error);
        logError(source);
        setStatus(
          isDuplicateEmployeeError(source)
            ? '保存失败：员工工号已存在，不能改成重复工号。'
            : '保存失败：' + errorMessage(source),
          'error'
        );
        emit();
        return false;
      }
    }

    const mappingsOk = await saveMappingForEmployee(
      nextEmployeeCode,
      previousEmployeeCode,
      nextCustomerCode
    );
    if (!mappingsOk) return false;

    employees = employees.map(row => {
      if (String(row.id) !== String(id)) return row;
      const employeeCode = String(data.employee_code || '');
      return {
        ...row,
        ...data,
        employee_code: employeeCode,
        name: String(data.name || ''),
        original_employee_code: employeeCode,
        is_active: data.is_active !== false,
        customer_code: getEmployeeCustomerCode(mappings, employeeCode)
      };
    });
    dirtyMap = new Map(dirtyMap);
    dirtyMap.delete(String(id));
    setSummary();
    emit();
    return true;
  }

  refreshSnapshot();

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot(): EmployeesSnapshot {
      return snapshot;
    },

    async loadEmployees(): Promise<boolean> {
      setStatus('正在加载员工...');
      dirtyMap = new Map();
      showInlineNewEmployee = false;
      creatingEmployee = false;
      emit();
      try {
        const data = await repository.loadEmployees();
        mappings = normalizeEmployeeMappings(data.mappings);
        employees = buildEmployeeRows(data.employees, mappings);
        setSummary();
        emit();
        return true;
      } catch (error) {
        const source = rawError(error);
        logError(source);
        const prefix = error instanceof EmployeesRepositoryError && error.source === 'mappings-load'
          ? '加载经销商客户编号失败：'
          : '加载失败：';
        setStatus(prefix + errorMessage(source), 'error');
        emit();
        return false;
      }
    },

    setSearch(value: unknown) {
      searchText = String(value ?? '');
      setSummary();
      emit();
    },

    clearSearch() {
      searchText = '';
      setSummary();
      emit();
    },

    markDirty(id: string, field: EmployeeEditableField, value: unknown): boolean {
      const index = employees.findIndex(row => String(row.id) === String(id));
      if (index < 0) return false;
      const normalized = normalizeEmployeeFieldValue(field, value);
      if (normalized === null) {
        setStatus('保存失败：一个员工只能对应一个经销商客户编号。', 'error');
        emit();
        return false;
      }
      const nextRow = { ...employees[index], [field]: normalized } as EmployeeRow;
      employees = employees.map((row, rowIndex) => rowIndex === index ? nextRow : row);
      const nextPatch = { ...(dirtyMap.get(String(id)) || {}), [field]: normalized };
      dirtyMap = new Map(dirtyMap);
      dirtyMap.set(String(id), nextPatch);
      setStatus(`已修改 ${dirtyMap.size} 条，记得保存。`);
      emit();
      return true;
    },

    openInlineEmployeeRow() {
      if (showInlineNewEmployee) return;
      showInlineNewEmployee = true;
      setStatus('请在列表最上方填写新员工，员工工号和姓名必填。');
      emit();
    },

    cancelInlineEmployeeRow() {
      if (creatingEmployee) return;
      showInlineNewEmployee = false;
      setSummary();
      emit();
    },

    async createEmployee(input: EmployeeCreateInput): Promise<boolean> {
      const customerCode = normalizeCustomerCode(input.customer_code);
      if (customerCode === null) {
        setStatus('保存失败：一个员工只能对应一个经销商客户编号。', 'error');
        emit();
        return false;
      }
      const payload: NewEmployeePayload = {
        employee_code: String(input.employee_code || '').trim(),
        name: String(input.name || '').trim(),
        is_active: Boolean(input.is_active)
      };
      if (!payload.employee_code || !payload.name) {
        setStatus('新增失败：员工工号和姓名不能为空。', 'error');
        emit();
        return false;
      }

      creatingEmployee = true;
      emit();
      let data: EmployeeSourceRow;
      try {
        data = await repository.insertEmployee(payload);
      } catch (error) {
        creatingEmployee = false;
        const source = rawError(error);
        logError(source);
        setStatus(
          isDuplicateEmployeeError(source)
            ? `新增失败：员工工号「${payload.employee_code}」已存在。`
            : '新增失败：' + errorMessage(source),
          'error'
        );
        emit();
        return false;
      }
      creatingEmployee = false;

      if (customerCode) {
        const mappingOk = await saveMappingForEmployee(
          payload.employee_code,
          '',
          customerCode
        );
        if (!mappingOk) return false;
      }

      employees = sortEmployees([...employees, {
        ...data,
        employee_code: String(data.employee_code || ''),
        name: String(data.name || ''),
        original_employee_code: String(data.employee_code || ''),
        is_active: data.is_active !== false,
        customer_code: customerCode
      }]);
      showInlineNewEmployee = false;
      setSummary();
      emit();
      return true;
    },

    saveRow,

    async saveAllDirty(): Promise<boolean> {
      const ids = Array.from(dirtyMap.keys());
      if (ids.length === 0) {
        setStatus('没有需要保存的修改。');
        emit();
        return true;
      }
      setStatus(`正在保存 ${ids.length} 条...`);
      emit();
      for (const id of ids) {
        const ok = await saveRow(id);
        if (!ok) break;
      }
      if (dirtyMap.size === 0) setStatus('全部修改已保存。', 'ok');
      else setStatus(`部分保存失败，剩余 ${dirtyMap.size} 条未保存。`, 'error');
      emit();
      return dirtyMap.size === 0;
    }
  };
}

export type EmployeesController = ReturnType<typeof createEmployeesController>;
