import { configureStore } from '@reduxjs/toolkit'
import { billingApi } from './api'

export const store = configureStore({
  reducer: {
    [billingApi.reducerPath]: billingApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(billingApi.middleware),
})
