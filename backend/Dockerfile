FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["src/Alugatek.API/Alugatek.API.csproj", "src/Alugatek.API/"]
COPY ["src/Alugatek.Domain/Alugatek.Domain.csproj", "src/Alugatek.Domain/"]
COPY ["src/Alugatek.Infrastructure/Alugatek.Infrastructure.csproj", "src/Alugatek.Infrastructure/"]
RUN dotnet restore "src/Alugatek.API/Alugatek.API.csproj"
COPY . .
RUN dotnet publish "src/Alugatek.API/Alugatek.API.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Alugatek.API.dll"]
