import React, { useEffect, useMemo, useState } from 'react';

import {
    Box,
    Chip,
    FormControl,
    IconButton,
    InputAdornment,
    InputLabel,
    LinearProgress,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import {
    Build as BuildIcon,
    Clear as ClearIcon,
    DeleteForever as DeleteIcon,
    GetApp as InstallIcon,
    HelpOutlineOutlined as ReadmeIcon,
    Search as SearchIcon,
    Update as UpdateIcon,
} from '@mui/icons-material';

import { DialogConfirm, I18n, type AdminConnection, type ThemeType } from '@iobroker/gui-components';

import ConfigDialog, { type ConfigDialogResult } from './ConfigDialog';
import { TabCache } from '../TabCache';
import type { HamNative, PluginRow } from '../types';
import {
    UNKNOWN_VERSION,
    buildRows,
    cleanModuleName,
    filterKeywords,
    findInstalled,
    getInstalledPackages,
    getInstalledVersions,
    npmPage,
    searchPlugins,
    splitLibraries,
} from '../npm';

const ROWS_PER_PAGE = [25, 50, 100];
/** more keywords are collapsed into a "+n" chip */
const MAX_KEYWORDS = 8;

interface PluginsTableProps {
    adapterConfig: HamNative;
    socket: AdminConnection;
    instanceId: string;
    onChange: (changes: Partial<HamNative>) => void;
    showToast: (toast: string) => void;
    themeType: ThemeType;
}

interface OpenConfig {
    moduleName: string;
    readme?: string;
    isNew: boolean;
}

export default function PluginsTable({
    adapterConfig,
    socket,
    instanceId,
    onChange,
    showToast,
    themeType,
}: PluginsTableProps): React.JSX.Element {
    const [instances, setInstances] = useState<string[]>([]);
    const [searchText, setSearchText] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE[1]);
    const [rows, setRows] = useState<PluginRow[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [openConfig, setOpenConfig] = useState<OpenConfig | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    adapterConfig._tabCache ||= {};

    const libraries = adapterConfig.libraries || '';
    const installed = useMemo(() => splitLibraries(libraries), [libraries]);
    const isGlobalMode = adapterConfig.useGlobalHomebridge;

    useEffect(() => {
        void socket
            .getForeignObjects('system.adapter.ham.*', 'instance')
            .then(objs => setInstances(Object.keys(objs)))
            .catch(e => console.error(`Cannot read instances: ${e}`));
    }, [socket]);

    useEffect(() => {
        if (isGlobalMode) {
            return;
        }
        let cancelled = false;
        setLoading(true);
        setLoadError(false);

        const load = async (): Promise<void> => {
            const result = await searchPlugins(search, page * rowsPerPage, rowsPerPage);
            const versions = getInstalledVersions(installed);
            const installedNames = Object.keys(versions).sort();
            // the installed modules are always shown on the first page
            const installedPackages =
                page === 0 && installedNames.length ? await getInstalledPackages(installedNames) : null;
            const newRows = buildRows(
                result.objects.map(o => o.package),
                installedPackages,
                versions,
                search,
            );
            if (!cancelled) {
                setRows(newRows);
                setTotalCount(result.total);
            }
        };

        load()
            .catch(e => {
                console.error(`Cannot load plugins: ${e}`);
                if (!cancelled) {
                    setRows([]);
                    setLoadError(true);
                }
            })
            .finally(() => !cancelled && setLoading(false));

        return () => {
            cancelled = true;
        };
    }, [search, page, rowsPerPage, installed, isGlobalMode]);

    const executeSearch = (text: string): void => {
        setSearch(text.trim());
        setPage(0);
    };

    const onConfigureClicked = (row: PluginRow): void => {
        const versionPostfix = row.installed === UNKNOWN_VERSION ? '' : `@${row.installed}`;
        setOpenConfig({
            moduleName: `${row.package.name}${versionPostfix}`,
            readme: row.package.links.homepage,
            isNew: false,
        });
    };

    const onUpdateOrInstallClicked = (row: PluginRow): void => {
        const packageRef = `${row.package.name}@${row.package.version}`;
        if (row.installed) {
            const newInstalled = [...installed];
            const index = findInstalled(newInstalled, row.package.name);
            if (index !== -1) {
                newInstalled[index] = packageRef;
                showToast(I18n.t('%s will be updated to %s', row.package.name, row.package.version));
                onChange({ libraries: newInstalled.join(' ') });
            }
        } else {
            setOpenConfig({ moduleName: packageRef, readme: row.package.links.homepage, isNew: true });
        }
    };

    const onDeleteConfirmed = (ok: boolean): void => {
        const moduleName = confirmDelete;
        setConfirmDelete(null);
        if (!ok || !moduleName) {
            return;
        }

        const newInstalled = [...installed];
        const index = findInstalled(newInstalled, moduleName);
        if (index === -1) {
            return;
        }
        showToast(I18n.t('%s will be removed', moduleName));
        const [removed] = newInstalled.splice(index, 1);
        const change: Partial<HamNative> = { libraries: newInstalled.join(' ') };
        try {
            const tabCache = new TabCache(adapterConfig._tabCache!);
            const { configList, configIndex } = tabCache.locateConfig(removed, adapterConfig.wrapperConfig);
            configList.splice(configIndex, 1);
            change.wrapperConfig = adapterConfig.wrapperConfig;
        } catch (e) {
            console.error(`Couldn't delete plugin from wrapperConfig: ${e}`);
        }
        onChange(change);
    };

    const onDialogClose = ({ save, wrapperConfig, cache }: ConfigDialogResult): void => {
        if (save && openConfig) {
            if (openConfig.isNew) {
                showToast(I18n.t('%s will be installed', openConfig.moduleName));
                onChange({
                    wrapperConfig,
                    libraries: [...installed, openConfig.moduleName].join(' '),
                    _tabCache: cache,
                });
            } else {
                onChange({ wrapperConfig, _tabCache: cache });
            }
        }
        setOpenConfig(null);
    };

    const onSwitchInstance = (id: string): void => {
        const parts = id.split('.');
        window.location.href = `${window.location.pathname}?${parts[parts.length - 1]}`;
    };

    const renderKeywords = (row: PluginRow): React.JSX.Element => {
        const keywords = (row.package.keywords || []).filter(filterKeywords);
        const hidden = keywords.slice(MAX_KEYWORDS);
        return (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {keywords.slice(0, MAX_KEYWORDS).map((k, i) => (
                    <Chip
                        key={`${k}_${i}`}
                        variant="outlined"
                        size="small"
                        label={k}
                    />
                ))}
                {hidden.length ? (
                    <Tooltip title={hidden.join(', ')}>
                        <Chip
                            size="small"
                            label={`+${hidden.length}`}
                        />
                    </Tooltip>
                ) : null}
            </Box>
        );
    };

    const renderActions = (row: PluginRow): React.JSX.Element => (
        <Stack
            direction="row"
            spacing={0.5}
        >
            <Tooltip title={I18n.t('Readme')}>
                <IconButton
                    size="small"
                    aria-label={I18n.t('Readme')}
                    href={row.package.links.homepage || npmPage(row.package.name)}
                    target="_blank"
                    rel="noreferrer"
                >
                    <ReadmeIcon fontSize="small" />
                </IconButton>
            </Tooltip>
            <Tooltip title={I18n.t(row.installed ? 'Update' : 'Install')}>
                <span>
                    <IconButton
                        size="small"
                        color="primary"
                        aria-label={I18n.t(row.installed ? 'Update' : 'Install')}
                        disabled={!!row.installed && row.installed === row.package.version}
                        onClick={() => onUpdateOrInstallClicked(row)}
                    >
                        {row.installed ? <UpdateIcon fontSize="small" /> : <InstallIcon fontSize="small" />}
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title={I18n.t('Configure')}>
                <span>
                    <IconButton
                        size="small"
                        aria-label={I18n.t('Configure')}
                        disabled={!row.installed}
                        onClick={() => onConfigureClicked(row)}
                    >
                        <BuildIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
            <Tooltip title={I18n.t('Remove')}>
                <span>
                    <IconButton
                        size="small"
                        color="error"
                        aria-label={I18n.t('Remove')}
                        disabled={!row.installed}
                        onClick={() => setConfirmDelete(row.package.name)}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </span>
            </Tooltip>
        </Stack>
    );

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Stack
                direction="row"
                spacing={2}
                sx={{ alignItems: 'center' }}
            >
                {instances.length > 1 ? (
                    <FormControl
                        size="small"
                        sx={{ minWidth: 120 }}
                    >
                        <InputLabel id="instanceId-label">{I18n.t('Instance')}</InputLabel>
                        <Select
                            labelId="instanceId-label"
                            label={I18n.t('Instance')}
                            value={instanceId}
                            onChange={e => onSwitchInstance(e.target.value)}
                        >
                            {instances.map(id => (
                                <MenuItem
                                    value={id}
                                    key={id}
                                >
                                    {id.replace('system.adapter.', '')}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                ) : null}
                {!isGlobalMode ? (
                    <TextField
                        size="small"
                        fullWidth
                        placeholder={I18n.t('Search')}
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && executeSearch(searchText)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <IconButton
                                            size="small"
                                            edge="start"
                                            onClick={() => executeSearch(searchText)}
                                        >
                                            <SearchIcon />
                                        </IconButton>
                                    </InputAdornment>
                                ),
                                endAdornment: searchText ? (
                                    <InputAdornment position="end">
                                        <IconButton
                                            size="small"
                                            edge="end"
                                            onClick={() => {
                                                setSearchText('');
                                                executeSearch('');
                                            }}
                                        >
                                            <ClearIcon />
                                        </IconButton>
                                    </InputAdornment>
                                ) : null,
                            },
                        }}
                    />
                ) : null}
            </Stack>

            {isGlobalMode ? (
                <Paper
                    variant="outlined"
                    sx={{ p: 2 }}
                >
                    <Typography
                        variant="h6"
                        gutterBottom
                    >
                        {I18n.t('Global Mode')}
                    </Typography>
                    <Typography variant="body1">{I18n.t('global_mode_note')}</Typography>
                </Paper>
            ) : (
                <Paper
                    variant="outlined"
                    sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                >
                    <Box sx={{ height: 4 }}>{loading ? <LinearProgress /> : null}</Box>
                    <TableContainer sx={{ flex: 1 }}>
                        <Table
                            stickyHeader
                            size="small"
                        >
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ width: 200 }}>{I18n.t('Name')}</TableCell>
                                    <TableCell sx={{ width: 170 }}>{I18n.t('Actions')}</TableCell>
                                    <TableCell>{I18n.t('Description')}</TableCell>
                                    <TableCell sx={{ width: 90 }}>{I18n.t('Installed')}</TableCell>
                                    <TableCell sx={{ width: 90 }}>{I18n.t('Available')}</TableCell>
                                    <TableCell sx={{ width: 300 }}>{I18n.t('Keywords')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {!rows.length && !loading ? (
                                    <TableRow>
                                        <TableCell
                                            colSpan={6}
                                            sx={{ textAlign: 'center', py: 4 }}
                                        >
                                            <Typography color={loadError ? 'error' : 'textSecondary'}>
                                                {I18n.t(loadError ? 'Cannot load the plugin list' : 'No data')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : null}
                                {rows.map(row => (
                                    <TableRow
                                        key={row.package.name}
                                        hover
                                    >
                                        <TableCell>
                                            <Tooltip title={row.package.name}>
                                                <Typography
                                                    variant="body2"
                                                    sx={{ fontWeight: row.installed ? 'bold' : undefined }}
                                                >
                                                    {cleanModuleName(row.package.name)}
                                                </Typography>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>{renderActions(row)}</TableCell>
                                        <TableCell>{row.package.description}</TableCell>
                                        <TableCell>{row.installed}</TableCell>
                                        <TableCell>{row.package.version}</TableCell>
                                        <TableCell>{renderKeywords(row)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <TablePagination
                        component="div"
                        count={totalCount}
                        page={page}
                        rowsPerPage={rowsPerPage}
                        rowsPerPageOptions={ROWS_PER_PAGE}
                        labelRowsPerPage={I18n.t('Rows per page')}
                        labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                        onPageChange={(_e, newPage) => setPage(newPage)}
                        onRowsPerPageChange={e => {
                            setRowsPerPage(parseInt(e.target.value, 10));
                            setPage(0);
                        }}
                    />
                </Paper>
            )}

            {openConfig ? (
                <ConfigDialog
                    themeType={themeType}
                    moduleName={openConfig.moduleName}
                    isNew={openConfig.isNew}
                    readme={openConfig.readme}
                    wrapperConfig={adapterConfig.wrapperConfig}
                    cache={adapterConfig._tabCache}
                    onClose={onDialogClose}
                />
            ) : null}
            {confirmDelete ? (
                <DialogConfirm
                    text={I18n.t('Do you really want to remove %s', confirmDelete)}
                    onClose={onDeleteConfirmed}
                />
            ) : null}
        </Box>
    );
}
