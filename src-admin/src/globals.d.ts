declare global {
    interface Window {
        _localStorage?: Storage;
        _sessionStorage?: Storage;
    }
}

declare module '@mui/material/Button' {
    interface ButtonPropsColorOverrides {
        grey: true;
    }
}

export {};
