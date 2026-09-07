FROM node:24-alpine AS web
WORKDIR /src/web
COPY fitness-tracker.web/package*.json ./
RUN npm ci
COPY fitness-tracker.web/ ./
RUN npx ng build --configuration production

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src
COPY fitness-tracker.api/FitnessTracker.Api.csproj fitness-tracker.api/
RUN dotnet restore fitness-tracker.api/FitnessTracker.Api.csproj
COPY fitness-tracker.api/ fitness-tracker.api/
COPY --from=web /src/fitness-tracker.api/wwwroot fitness-tracker.api/wwwroot
RUN dotnet publish fitness-tracker.api/FitnessTracker.Api.csproj -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /app .
ENV ASPNETCORE_HTTP_PORTS=8080
ENV ConnectionStrings__Default="Data Source=/data/fitness.db"
ENV DataProtection__KeysPath=/data/keys
VOLUME /data
EXPOSE 8080
ENTRYPOINT ["dotnet", "FitnessTracker.Api.dll"]
