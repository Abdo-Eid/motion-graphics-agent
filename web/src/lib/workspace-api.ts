import { getMastraUrl } from './events'

export type WorkspaceFileEntry = {
  name: string
  kind: 'file' | 'dir'
}

export type WorkspaceFile = {
  content: string
  mime: string
}

function workspaceUrl(pathname: string, path: string) {
  const url = new URL(pathname, getMastraUrl())
  url.searchParams.set('path', path)
  return url.toString()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export function listWorkspaceFiles(path = '') {
  return fetchJson<WorkspaceFileEntry[]>(workspaceUrl('/workspace/files', path))
}

export function getWorkspaceFile(path: string) {
  return fetchJson<WorkspaceFile>(workspaceUrl('/workspace/file', path))
}

export async function uploadProjectFile(projectId: string, file: File) {
  const body = new FormData()
  body.set('projectId', projectId)
  body.set('file', file)

  const response = await fetch(new URL('/uploads', getMastraUrl()), {
    method: 'POST',
    body,
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<{ assetId: string; ingestStatus?: string }>
}
