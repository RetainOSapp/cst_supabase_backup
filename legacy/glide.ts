export type GlideRow = Record<string, unknown> & {
  id?: string;
  rowID?: string;
};

export async function glideGetRows(params: {
  apiToken: string;
  tableId: string;
  limit?: number;
  continuation?: string;
}): Promise<{ data: GlideRow[]; continuation?: string }> {
  const url = new URL(
    `https://api.glideapps.com/tables/${encodeURIComponent(params.tableId)}/rows`
  );
  if (params.limit != null) url.searchParams.set('limit', String(params.limit));
  if (params.continuation) url.searchParams.set('continuation', params.continuation);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Glide get rows failed (${res.status} ${res.statusText}): ${text || '<no body>'}`
    );
  }

  const json = (await res.json()) as unknown;
  if (
    !json ||
    typeof json !== 'object' ||
    !('data' in json) ||
    !Array.isArray((json as any).data)
  ) {
    throw new Error('Unexpected Glide response shape.');
  }

  return {
    data: (json as any).data as GlideRow[],
    continuation:
      typeof (json as any).continuation === 'string'
        ? ((json as any).continuation as string)
        : undefined,
  };
}

