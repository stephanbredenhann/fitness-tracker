import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth.store';

// A 401 from the app API means the cookie expired: drop to the login page.
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthStore), router = inject(Router);
  return next(req).pipe(catchError((e: unknown) => {
    if (e instanceof HttpErrorResponse && e.status === 401 && req.url.startsWith('/api/')) {
      auth.me.set(null);
      router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
    }
    return throwError(() => e);
  }));
};
