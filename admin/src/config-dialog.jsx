import Backdrop from '@material-ui/core/Backdrop';
import Button from '@material-ui/core/Button';
import CircularProgress from '@material-ui/core/CircularProgress';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import Typography from '@material-ui/core/Typography';
import Form from '@rjsf/material-ui';
import React, { Fragment, useEffect, useReducer } from 'react';
import JSONInput from 'react-json-editor-ajrm';
import locale from 'react-json-editor-ajrm/locale/en';
import ReactMarkdown from 'react-markdown';

/*const schema = {
    title: 'Todo',
    type: 'object',
    required: ['title'],
    properties: {
        title: { type: 'string', title: 'Title', default: 'A new task' },
        done: { type: 'boolean', title: 'Done?', default: false },
    },
};*/

const log = (type) => console.log.bind(console, type);

const initialState = {
    loading: false,
    open: false,
    title: '',
    configSchema: undefined,
    lastQuery: undefined,
};

function reducer(state, { type, payload }) {
    switch (type) {
        case 'FETCH_INIT':
            return {
                ...state,
                loading: true,
            };
        case 'UPDATE_QUERY':
            return {
                ...state,
                lastQuery: payload,
            };
        case 'OPEN_DIALOG':
            return {
                ...state,
                ...payload,
                loading: false,
                open: true,
            };
        case 'CLOSE_DIALOG':
            return {
                ...state,
                loading: false,
                open: false,
            };
        default:
            return state;
    }
}

export default ({ moduleName, wrapperConfig }) => {
    const [state, dispatch] = useReducer(reducer, { ...initialState, wrapperConfig: wrapperConfig });

    const loadData = () => {
        const { lastQuery, loading } = state;

        const query = `https://cdn.jsdelivr.net/npm/${encodeURI(moduleName)}/config.schema.json`;
        if (moduleName && query !== lastQuery && !loading) {
            dispatch({ type: 'FETCH_INIT' });
            fetch(query)
                .then((response) => response.json())
                .then((configSchema) => {
                    if (!configSchema.schema) {
                        throw new Error('Invalid schema found');
                    }
                    dispatch({
                        type: 'OPEN_DIALOG',
                        payload: {
                            configSchema: configSchema,
                            title: configSchema.pluginAlias,
                        },
                    });
                })
                .catch(() =>
                    dispatch({
                        type: 'OPEN_DIALOG',
                        payload: {
                            configSchema: undefined,
                            title: moduleName,
                        },
                    }),
                );
            dispatch({ type: 'UPDATE_QUERY', payload: query });
        }
    };

    useEffect(() => loadData());

    const handleClose = () => {
        dispatch({ type: 'CLOSE_DIALOG' });
    };

    const { loading, open, title, configSchema } = state;
    console.log('wrapperConfig', wrapperConfig, configSchema);
    let config = {};
    if (configSchema) {
        const kind = configSchema.pluginType === 'platform' ? 'platforms' : 'accessories';
        const configList = wrapperConfig[kind];
        config = configList.find((c) => c[configSchema.pluginType] === configSchema.pluginAlias);
        console.log(config);
    }
    return (
        <>
            <Backdrop open={loading} style={{ zIndex: 2000 }}>
                <CircularProgress color="inherit" />
            </Backdrop>
            <Dialog aria-labelledby="form-dialog-title" fullWidth={true} maxWidth="md" open={open}>
                <DialogTitle id="form-dialog-title">Configure {title}</DialogTitle>
                <DialogContent>
                    {configSchema?.headerDisplay && (
                        <Typography component="div">
                            <ReactMarkdown linkTarget="_blank">{configSchema.headerDisplay}</ReactMarkdown>
                        </Typography>
                    )}
                    {configSchema && (
                        <Form
                            schema={configSchema.schema}
                            formData={config}
                            onChange={log('changed')}
                            onSubmit={log('submitted')}
                            onError={log('errors')}
                        >
                            <Fragment />
                        </Form>
                    )}
                    {!configSchema && (
                        <JSONInput id={title} placeholder={{}} locale={locale} width="100%" height="550px" />
                    )}
                </DialogContent>
                <DialogActions>
                    <Typography component="div">
                        <ReactMarkdown linkTarget="_blank">{configSchema?.footerDisplay}</ReactMarkdown>
                    </Typography>
                    <div style={{ flex: '1 0 0' }} />
                    <Button color="primary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button color="primary">Save</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};
