import 'reflect-metadata'; import {NestFactory} from '@nestjs/core'; import {AppModule} from './module';
async function bootstrap(){const app=await NestFactory.create(AppModule);app.setGlobalPrefix('api');app.enableCors({origin:true,credentials:true});await app.listen(process.env.PORT??4000)} bootstrap();
