const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const logger = require('./logger');

class HostManager {
    constructor() {
        this.hostsPath = path.join(process.env.WINDIR || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
        this.backupPath = this.hostsPath + '.tts-proxy-backup';
        this.proxyEntry = '127.0.0.1 api.elevenlabs.io # TTS-Proxy redirect';
    }

    async checkAdminRights() {
        return new Promise((resolve) => {
            exec('net session', (error) => {
                resolve(!error);
            });
        });
    }

    async backupHostsFile() {
        try {
            if (!fs.existsSync(this.backupPath)) {
                fs.copyFileSync(this.hostsPath, this.backupPath);
                logger.info('Hosts file backed up successfully');
            }
            return true;
        } catch (error) {
            logger.error('Failed to backup hosts file:', error);
            return false;
        }
    }

    async readHostsFile() {
        try {
            return fs.readFileSync(this.hostsPath, 'utf8');
        } catch (error) {
            logger.error('Failed to read hosts file:', error);
            throw error;
        }
    }

    async writeHostsFile(content) {
        try {
            fs.writeFileSync(this.hostsPath, content, 'utf8');
            logger.info('Hosts file updated successfully');
            return true;
        } catch (error) {
            logger.error('Failed to write hosts file:', error);
            return false;
        }
    }

    async addProxyRedirect() {
        try {
            const hasAdmin = await this.checkAdminRights();
            if (!hasAdmin) {
                throw new Error('Administrator privileges required to modify hosts file');
            }

            await this.backupHostsFile();
            
            const hostsContent = await this.readHostsFile();
            
            // Check if redirect already exists
            if (hostsContent.includes('api.elevenlabs.io')) {
                logger.info('ElevenLabs redirect already exists in hosts file');
                return true;
            }

            // Add the redirect
            const newContent = hostsContent + '\n' + this.proxyEntry + '\n';
            const success = await this.writeHostsFile(newContent);
            
            if (success) {
                logger.info('Successfully added ElevenLabs redirect to hosts file');
                await this.flushDNS();
            }
            
            return success;
        } catch (error) {
            logger.error('Failed to add proxy redirect:', error);
            throw error;
        }
    }

    async removeProxyRedirect() {
        try {
            const hasAdmin = await this.checkAdminRights();
            if (!hasAdmin) {
                throw new Error('Administrator privileges required to modify hosts file');
            }

            const hostsContent = await this.readHostsFile();
            
            // Remove TTS-Proxy entries
            const lines = hostsContent.split('\n');
            const filteredLines = lines.filter(line => 
                !line.includes('# TTS-Proxy redirect') && 
                !line.includes('api.elevenlabs.io')
            );
            
            const newContent = filteredLines.join('\n');
            const success = await this.writeHostsFile(newContent);
            
            if (success) {
                logger.info('Successfully removed ElevenLabs redirect from hosts file');
                await this.flushDNS();
            }
            
            return success;
        } catch (error) {
            logger.error('Failed to remove proxy redirect:', error);
            throw error;
        }
    }

    async restoreHostsFile() {
        try {
            if (fs.existsSync(this.backupPath)) {
                fs.copyFileSync(this.backupPath, this.hostsPath);
                logger.info('Hosts file restored from backup');
                await this.flushDNS();
                return true;
            } else {
                logger.warn('No backup file found');
                return false;
            }
        } catch (error) {
            logger.error('Failed to restore hosts file:', error);
            return false;
        }
    }

    async flushDNS() {
        return new Promise((resolve) => {
            exec('ipconfig /flushdns', (error, stdout) => {
                if (error) {
                    logger.warn('Failed to flush DNS cache:', error.message);
                } else {
                    logger.info('DNS cache flushed successfully');
                }
                resolve(!error);
            });
        });
    }

    async getStatus() {
        try {
            const hostsContent = await this.readHostsFile();
            const hasRedirect = hostsContent.includes('api.elevenlabs.io');
            const hasBackup = fs.existsSync(this.backupPath);
            const hasAdmin = await this.checkAdminRights();
            
            return {
                hasRedirect,
                hasBackup,
                hasAdmin,
                hostsPath: this.hostsPath,
                backupPath: this.backupPath
            };
        } catch (error) {
            logger.error('Failed to get hosts file status:', error);
            return {
                hasRedirect: false,
                hasBackup: false,
                hasAdmin: false,
                error: error.message
            };
        }
    }
}

module.exports = HostManager;
