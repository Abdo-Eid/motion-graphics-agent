export const ACCEPTED_UPLOAD_TYPES = '.pdf,.md,.txt,.csv,image/*'

export function isAcceptedUpload(file: File) {
  const lowerName = file.name.toLowerCase()
  return (
    file.type.startsWith('image/') ||
    file.type === 'application/pdf' ||
    file.type === 'text/markdown' ||
    file.type === 'text/plain' ||
    file.type === 'text/csv' ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.pdf')
  )
}
