// tests/setup.ts
// F16 (спека 2.1.0 §2.4): изоляция юзер-конфига — XDG_CONFIG_HOME в tmp выставляется
// ДО импортов тестируемого кода; тесты не должны трогать реальный ~/.config/wolf.
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 'wolf-test-xdg-'));

/** Tmp-XDG этой тестовой сессии (для инвариант-тестов глобальной изоляции). */
export const TEST_XDG = process.env.XDG_CONFIG_HOME;
