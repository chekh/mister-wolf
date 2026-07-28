# Test Plan: Export to CSV

**Goal:** Add CSV export to the reports page
**Architecture:** Single function in reports module, new CSV formatter utility

---

### Task 1: CSV Formatter Utility

**Files:**
- Create: `src/utils/csv-formatter.ts`
- Test: `src/utils/csv-formatter.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
test('formats array to CSV', () => {
  const result = formatCSV([['a', 'b'], ['c', 'd']])
  expect(result).toBe('a,b\nc,d\n')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest src/utils/csv-formatter.test.ts --reporter=verbose
```
Expected: FAIL — `formatCSV` is not yet implemented.

- [ ] **Step 3: Implement formatCSV**

```typescript
export function formatCSV(rows: string[][]): string {
  return rows.map(r => r.join(',')).join('\n') + '\n'
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest src/utils/csv-formatter.test.ts --reporter=verbose
```
Expected: PASS — all tests pass after implementation.

- [ ] **Step 5: Commit**

```bash
git add src/utils/csv-formatter.ts src/utils/csv-formatter.test.ts && git commit -m "feat: add CSV formatter utility"
```

---

### Task 2: Export Button

**Files:**
- Modify: `src/pages/reports.tsx`

- [ ] **Step 1: Add export button**

```tsx
<button onClick={() => handleExport()}>Export CSV</button>
```

- [ ] **Step 2: Add error handling**

```typescript
try {
  await handleExport()
} catch (e) {
  if (e instanceof FileWriteError) {
    showToast('Failed to write file')
  } else if (e instanceof DataValidationError) {
    showToast('Invalid data format')
  } else {
    showToast('Export failed: ' + (e as Error).message)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/reports.tsx && git commit -m "feat: add export button with error handling"
```

---

### Task 3: Wire Export to CSV Formatter

**Files:**
- Modify: `src/pages/reports.tsx`

- [ ] **Step 1: Connect button to formatter**

```typescript
import { formatCSV } from '../utils/csv-formatter'

// Ensure reportData is string[][] — transform if needed
const csvData: string[][] = reportData as string[][]

function handleExport() {
  const csv = formatCSV(csvData)
  downloadFile(csv, 'report.csv')
}
```

```typescript
function downloadFile(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/reports.tsx && git commit -m "feat: wire export to CSV formatter"
```
