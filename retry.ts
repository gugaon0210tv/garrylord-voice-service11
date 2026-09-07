type Fn = () => Promise<any>

type ErrorFn = (index: number, error: unknown) => void

export const retry = async function (
  fn: Fn,
  times: number,
  errorFn?: ErrorFn,
  failedMessage?: string,
) {
  const reason: {
    message: string
    errors: unknown[]
  } = {
    message: failedMessage ?? '多次尝试后失败',
    errors: [],
  }

  for (let i = 0; i < times; i++) {
    try {
      return await fn()
    } catch (error: unknown) {
      if (errorFn) {
        errorFn(i, error)
      }

      reason.errors.push(error)
    }
  }

  throw reason
}
