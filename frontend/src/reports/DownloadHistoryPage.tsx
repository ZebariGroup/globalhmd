import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext.tsx';
import Stack from '@mui/material/Stack';

const API_BASE = import.meta.env.VITE_BACKEND_URL ?? '';

const DownloadHistorySchema = z.object({
  reportName: z.string().nullable(),
  downloadedBy: z.string().nullable(),
  downloadedAt: z.string().nullable(),
  filePath: z.string().nullable(),
});

const DownloadHistoryResponseSchema = z.object({
  code: z.string(),
  status: z.string(),
  message: z.string().nullable(),
  data: z.array(DownloadHistorySchema).nullable(),
});

type DownloadHistoryRecord = z.infer<typeof DownloadHistorySchema>;

type PeriodFilter = '30' | '60' | '90';

function useDownloadHistory(filter: PeriodFilter, authorization?: string) {
  return useQuery({
    queryKey: ['download-history', filter],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/report/download-history?dayDiff=${filter}`, {
        headers: {
          Authorization: authorization ?? '',
        },
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to fetch download history');
      }
      const json = await response.json();
      return DownloadHistoryResponseSchema.parse(json);
    },
    enabled: Boolean(authorization),
  });
}

export default function DownloadHistoryPage() {
  const { authorizationHeader } = useAuth();
  const [period, setPeriod] = useState<PeriodFilter>('30');
  const { data, isLoading, error, refetch } = useDownloadHistory(period, authorizationHeader);

  const records = useMemo<DownloadHistoryRecord[]>(() => {
    if (!data?.data) return [];
    return data.data;
  }, [data]);

  return (
    <Box>
      <Card>
        <CardContent>
          <Stack spacing={2} direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="h6">Download History</Typography>
              <Typography variant="body2" color="text.secondary">
                Track all report downloads issued within your organization.
              </Typography>
            </Box>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel id="period-label">Period</InputLabel>
              <Select
                labelId="period-label"
                value={period}
                label="Period"
                onChange={(event) => {
                  setPeriod(event.target.value as PeriodFilter);
                  refetch();
                }}
              >
                <MenuItem value="30">Last 30 days</MenuItem>
                <MenuItem value="60">Last 60 days</MenuItem>
                <MenuItem value="90">Last 90 days</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </CardContent>
      </Card>
      <Divider sx={{ my: 3 }} />
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{(error as Error).message}</Alert>
      ) : records.length === 0 ? (
        <Alert severity="info">No downloads recorded for the selected period.</Alert>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Report</TableCell>
              <TableCell>Downloaded By</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>File Path</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map((record, index) => (
              <TableRow key={`${record.filePath ?? index}-${index}`}>
                <TableCell>{record.reportName ?? '—'}</TableCell>
                <TableCell>{record.downloadedBy ?? '—'}</TableCell>
                <TableCell>
                  {record.downloadedAt
                    ? dayjs(record.downloadedAt).format('MMM D, YYYY h:mm A')
                    : '—'}
                </TableCell>
                <TableCell>{record.filePath ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Box>
  );
}
