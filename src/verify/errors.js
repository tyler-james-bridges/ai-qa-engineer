class VerificationInputError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = 'VerificationInputError';
    this.code = 'VERIFY_INPUT_ERROR';
    this.details = details;
  }
}

class VerificationRuntimeError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'VerificationRuntimeError';
    this.code = 'VERIFY_RUNTIME_ERROR';
    this.cause = cause;
  }
}

module.exports = {
  VerificationInputError,
  VerificationRuntimeError,
};
