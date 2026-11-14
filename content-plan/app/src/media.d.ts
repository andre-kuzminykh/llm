// Видео-файлы как модули: Vite отдаёт адрес (в сборке одним файлом — data:-адрес, scripts/single.mjs).
declare module '*.webm' {
  const src: string
  export default src
}
declare module '*.mp4' {
  const src: string
  export default src
}
