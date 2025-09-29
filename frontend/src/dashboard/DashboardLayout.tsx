import { Outlet, Link, useLocation } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext.tsx';

export default function DashboardLayout() {
  const { signOut } = useAuth();
  const location = useLocation();

  const currentTab = useMemo(() => {
    if (location.pathname === '/' || location.pathname === '') {
      return '/';
    }
    return false;
  }, [location.pathname]);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Curasev Reporting
          </Typography>
          <Button color="inherit" onClick={signOut}>
            Sign Out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Tabs value={currentTab} aria-label="report tabs">
          <Tab label="Download History" value="/" component={Link} to="/" />
        </Tabs>
        <Box sx={{ mt: 3 }}>
          <Outlet />
        </Box>
      </Container>
    </Box>
  );
}
