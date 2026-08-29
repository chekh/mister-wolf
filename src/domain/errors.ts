/**
 * Ожидаемая ошибка валидации/использования (см. W4 Phase A roadmap v3):
 * CLI печатает одну строку `Error: <message>` в stderr, exit 1, без stack trace.
 * Неожиданные исключения идут обычным путём со стеком.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}
