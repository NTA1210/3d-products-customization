import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('jobs')
export class JobController {
  constructor(private readonly db: PrismaService) {}

  @Get(':id')
  async get(@Param('id') id: string) {
    const job = await this.db.job.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job not found.');
    return job;
  }
}
