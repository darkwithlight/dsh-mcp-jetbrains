/**
 * dsh-mcp-jetbrains —— 两半端的环境声明（只参与 `tsc -p tsconfig.json`，不进运行期）。
 *
 * 浏览器半端由 DSH Web 客户端直接加载，运行环境里没有 node_modules：
 * React 与模块加载器都是宿主注入的，所以这里只声明形状，不声明实现。
 * Host 半端的 `@deepseek-ai/*` 是 peerDependencies，工程内同样没有可供解析的
 * node_modules（运行期由宿主/安装器提供），因此下面用 ambient module 垫类型。
 */

declare namespace JSX {
  /**
   * 经典 JSX 运行时：JSX 表达式的类型就是 jsxFactory（`h`）的返回类型。
   * `h` 声明为 any，这里同样放宽成 any，避免给每个元素手写 props 类型。
   */
  type Element = any

  /** 宿主 React 的 createElement 无类型可用，内置元素一律放行。 */
  interface IntrinsicElements {
    [key: string]: any
  }
}

interface Window {
  /** DSH Web 客户端的模块加载器：自注册脚本从这里挂载本页。 */
  __ModuleLoader__: any
}

/** 宿主注入的 CommonJS 风格 require（React 由宿主提供，包内没有依赖可解析）。 */
declare function require(id: string): any

/* ── Host 半端：peer 依赖的类型垫片 ─────────────────────────────────────────
 *
 * 只声明 `src/index.ts` 用到的形状，不伪造值：运行期仍然裸 import 这两个包，
 * 由 DSH 安装器按 peer 名解析到宿主树。
 */

declare module '@deepseek-ai/schemastery' {
  /** 链式 schema 构造器：本插件只用到 object / array / string / number / boolean。 */
  interface Schema<T> {
    (value?: unknown): T
    required(): Schema<T>
    description(text: string): Schema<T>
    pattern(pattern: RegExp): Schema<T>
    default(value: T): Schema<T>
    step(value: number): Schema<T>
    min(value: number): Schema<T>
    max(value: number): Schema<T>
  }

  interface Schemastery {
    string(): Schema<string>
    number(): Schema<number>
    boolean(): Schema<boolean>
    array<T>(inner: Schema<T>): Schema<T[]>
    object<T = any>(shape: Record<string, Schema<any>>): Schema<T>
  }

  const z: Schemastery
  export default z
}

declare module '@deepseek-ai/dsh-mcp-client' {
  /** 子插件对象：这里只作为 `ctx.plugin()` 的不透明参数。 */
  const McpClient: any
  export default McpClient
  export const name: string
  export const inject: string[]
}
